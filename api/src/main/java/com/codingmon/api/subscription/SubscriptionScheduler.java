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
            resolver.locked(userId, id -> {
                Optional<Sub> sub = repo.findSub(id);
                if (sub.isPresent() && PaymentResolver.effective(sub, repo.findPending(id), Instant.now()) == Status.NONE
                        && sub.get().status() == Status.CANCEL_SCHEDULED) {
                    resolver.endSubscription(sub.get());
                }
                return true;
            });
        }
    }

    // 결제 기록을 PENDING으로 먼저 저장한 뒤 결제한다. 주기는 기록을 만들 때 정한다(다음 주기가 있으면 그것으로 하고 비운다).
    void renew() {
        for (Long userId : repo.findDueRenewals(BATCH)) {
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
                continue;
            }
            String customerId = repo.findCustomerId(userId).orElse(null);
            if (customerId == null) {
                continue;
            }
            PayResult result = portone.payWithBillingKey(payment.paymentId(), payment.billingKey(), customerId,
                    payment.cycle().orderName, payment.amount());
            resolver.applyPayResult(payment, result, null);
        }
    }

    // 결과 모름 결제(첫 결제든 갱신이든)를 결제 ID로 다시 조회해 확정한다. 포트원에 없으면 같은 결제 ID로 다시 보낸다.
    void requery() {
        for (String paymentId : repo.findStalePending(PENDING_GRACE_SECONDS, BATCH)) {
            try {
                resolver.resolve(paymentId, null, true);
            } catch (PortOneClient.UnavailableException e) {
                log.warn("결과 모름 결제 다시 조회 실패 {}", paymentId);
                return;
            }
        }
    }

    // 지울 빌링키 목록을 비운다. 지우기 직전에 다시 쓰는 중이 된 카드는 지우지 않고 목록에서만 뺀다.
    void deleteKeys() {
        List<Deletion> deletions = repo.findDeletions(BATCH);
        for (Deletion deletion : deletions) {
            try {
                if (deletion.billingKey() != null) {
                    if (repo.isKeyInUseAnywhere(deletion.billingKey()) || portone.deleteBillingKey(deletion.billingKey())) {
                        repo.removeDeletion(deletion.id());
                    }
                    continue;
                }
                // 탈퇴한 고객. 이 고객 ID의 빌링키를 모두 찾아 지운다. 하나라도 실패하면 다음 실행 때 처음부터 다시 한다.
                boolean allDeleted = true;
                for (String key : portone.findBillingKeysOfCustomer(deletion.customerId(), deletion.customerSince())) {
                    allDeleted &= portone.deleteBillingKey(key);
                }
                if (allDeleted) {
                    repo.removeDeletion(deletion.id());
                }
            } catch (PortOneClient.UnavailableException e) {
                log.warn("빌링키 지우기 실패, 다음 실행 때 다시 한다");
                return;
            }
        }
    }
}
