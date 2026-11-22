package com.codingmon.api.subscription;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.codingmon.api.subscription.PortOneClient.PayResult;
import com.codingmon.api.subscription.SubscriptionRepository.Cycle;
import com.codingmon.api.subscription.SubscriptionRepository.Deletion;
import com.codingmon.api.subscription.SubscriptionRepository.Kind;
import com.codingmon.api.subscription.SubscriptionRepository.Payment;
import com.codingmon.api.subscription.SubscriptionRepository.PayStatus;
import com.codingmon.api.subscription.SubscriptionRepository.Status;
import com.codingmon.api.subscription.SubscriptionRepository.Sub;

// 갱신 결제, 결과 모름 결제 다시 조회, 끝난 해지 예정 정리, 빌링키 지우기(#332).
// 포트원 결제 예약은 쓰지 않고 기간이 끝난 구독을 찾아 빌링키로 바로 결제한다.
@Component
class SubscriptionScheduler {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionScheduler.class);

    private static final int BATCH = 50;
    // 막 보낸 결제 요청과 겹치지 않게, 만든 지 이만큼 지난 결과 모름 결제만 다시 조회한다.
    private static final long PENDING_GRACE_SECONDS = 60;

    private final SubscriptionRepository repo;
    private final PortOneClient portone;
    private final PaymentResolver resolver;

    SubscriptionScheduler(SubscriptionRepository repo, PortOneClient portone, PaymentResolver resolver) {
        this.repo = repo;
        this.portone = portone;
        this.resolver = resolver;
    }

    @Scheduled(fixedDelay = 60_000)
    void run() {
        endCancellations();
        int flagged = repo.flagLongPending();
        if (flagged > 0) {
            log.error("1시간 넘게 결과를 모르는 결제 {}건을 '확인 필요'로 표시했다", flagged);
        }
        if (!portone.isConfigured()) {
            return;
        }
        renew();
        requery();
        deleteKeys();
    }

    // 기간이 지난 해지 예정을 NONE으로 정리하고 카드를 지운다(결과 모름 갱신이 있으면 확정될 때까지 두지 않는다).
    void endCancellations() {
        for (Long userId : repo.findEndedCancellations(BATCH)) {
            isolated("해지 예정 정리 " + userId, () -> resolver.locked(userId, id -> {
                Optional<Sub> sub = repo.findSub(id);
                if (sub.isPresent() && PaymentResolver.effective(sub, repo.findPending(id), Instant.now()) == Status.NONE
                        && sub.get().status() == Status.CANCEL_SCHEDULED) {
                    resolver.endSubscription(sub.get());
                }
                return true;
            }));
        }
    }

    // 결제 기록을 PENDING으로 먼저 저장한 뒤 결제한다. 주기는 기록을 만들 때 정한다(다음 주기가 있으면 그것으로 하고 비운다).
    void renew() {
        for (Long userId : repo.findDueRenewals(BATCH)) {
            isolated("갱신 결제 " + userId, () -> renew(userId));
        }
    }

    private void renew(long userId) {
        Payment payment = resolver.locked(userId, id -> {
            Sub sub = repo.findSub(id).orElse(null);
            if (sub == null || sub.status() != Status.ACTIVE || sub.periodEnd().isAfter(Instant.now())
                    || repo.findPending(id).isPresent()) {
                return null;
            }
            Cycle cycle = sub.nextCycle() != null ? sub.nextCycle() : sub.cycle();
            Payment created = new Payment(SubscriptionRepository.newPaymentId(), id, Kind.RENEWAL, cycle, cycle.amount,
                    sub.billingKey(), PayStatus.PENDING, false, null, null);
            repo.insertPayment(created);
            repo.setNextCycle(id, null);
            return created;
        });
        if (payment == null) {
            return;
        }
        String customerId = repo.findCustomerId(userId).orElse(null);
        if (customerId == null) {
            return;
        }
        PayResult result = portone.payWithBillingKey(payment.paymentId(), payment.billingKey(), customerId,
                payment.cycle().orderName, payment.amount());
        resolver.applyPayResult(payment, result, null);
    }

    // 결과 모름 결제(첫 결제든 갱신이든)를 결제 ID로 다시 조회해 확정한다. 포트원에 없으면 같은 결제 ID로 다시 보낸다.
    void requery() {
        for (String paymentId : repo.findStalePending(PENDING_GRACE_SECONDS, BATCH)) {
            if (!isolated("결과 모름 결제 다시 조회 " + paymentId, () -> resolver.resolve(paymentId, null, true))) {
                return;
            }
        }
    }

    // 지울 빌링키 목록을 비운다. 지우기 직전에 다시 쓰는 중이 된 카드는 지우지 않고 목록에서만 뺀다.
    void deleteKeys() {
        List<Deletion> deletions = repo.findDeletions(BATCH);
        for (Deletion deletion : deletions) {
            if (!isolated("빌링키 지우기 " + deletion.id(), () -> deleteKey(deletion))) {
                return;
            }
        }
    }

    private void deleteKey(Deletion deletion) {
        if (deletion.billingKey() != null) {
            if (repo.isKeyInUseAnywhere(deletion.billingKey()) || portone.deleteBillingKey(deletion.billingKey())) {
                repo.removeDeletion(deletion.id());
            }
            return;
        }
        // 탈퇴한 고객. 이 고객 ID의 빌링키를 모두 찾아 지운다. 하나라도 실패하면 다음 실행 때 처음부터 다시 한다.
        boolean allDeleted = true;
        for (String key : portone.findBillingKeysOfCustomer(deletion.customerId(), deletion.customerSince())) {
            allDeleted &= portone.deleteBillingKey(key);
        }
        if (allDeleted) {
            repo.removeDeletion(deletion.id());
        }
    }

    // 한 건의 오류가 나머지 건과 다른 단계를 막지 않게 건마다 잡는다. 포트원이 응답하지 않으면 false라 이번 실행의 그 단계를 멈춘다
    // (남은 건도 시간 초과만 기다리게 된다). 목록은 무작위 순서라 계속 실패하는 건이 있어도 다른 건이 차례를 얻는다.
    private static boolean isolated(String what, Runnable work) {
        try {
            work.run();
            return true;
        } catch (PortOneClient.UnavailableException e) {
            log.warn("{} 실패(포트원 응답 없음), 다음 실행 때 다시 한다", what);
            return false;
        } catch (RuntimeException e) {
            log.error("{} 실패", what, e);
            return true;
        }
    }
}
