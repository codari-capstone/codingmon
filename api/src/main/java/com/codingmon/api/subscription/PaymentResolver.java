package com.codingmon.api.subscription;

import java.time.Instant;
import java.util.Objects;
import java.util.Optional;
import java.util.function.Function;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import com.codingmon.api.subscription.PortOneClient.PayResult;
import com.codingmon.api.subscription.PortOneClient.PaymentInfo;
import com.codingmon.api.subscription.SubscriptionRepository.Kind;
import com.codingmon.api.subscription.SubscriptionRepository.PayStatus;
import com.codingmon.api.subscription.SubscriptionRepository.Payment;
import com.codingmon.api.subscription.SubscriptionRepository.Status;
import com.codingmon.api.subscription.SubscriptionRepository.Sub;

// 결제 결과를 구독에 반영한다. 결제 시작·웹훅·스케줄러가 같이 쓴다(openapi startSubscription, receivePortoneWebhook).
// 포트원 호출은 잠금 밖에서 하고, 반영은 사용자 행을 잠근 짧은 트랜잭션에서 결제 기록을 다시 읽은 뒤 한다.
// 그래서 같은 결과가 여러 경로로 와도 한 번만 반영된다.
@Component
class PaymentResolver {

    private static final Logger log = LoggerFactory.getLogger(PaymentResolver.class);

    // 반영한 뒤 그 결제 기록의 상태. PAID_NOT_APPLIED는 돈은 나갔는데 구독에 반영하지 않은 결제('취소 필요')다.
    enum Resolution { PAID_APPLIED, PAID_NOT_APPLIED, FAILED, UNKNOWN }

    private final SubscriptionRepository repo;
    private final PortOneClient portone;
    private final TransactionTemplate transactions;

    PaymentResolver(SubscriptionRepository repo, PortOneClient portone, TransactionTemplate transactions) {
        this.repo = repo;
        this.portone = portone;
        this.transactions = transactions;
    }

    // 구독이 실제로 어떤 상태인지. 해지 예정인데 기간이 지났고 결과 모름 갱신이 없으면 스케줄러가 정리하기 전이라도 NONE이다.
    static Status effective(Optional<Sub> sub, Optional<Payment> pending, Instant now) {
        if (sub.isEmpty()) {
            return Status.NONE;
        }
        Sub s = sub.get();
        boolean renewalPending = pending.filter(p -> p.kind() == Kind.RENEWAL).isPresent();
        if (s.status() == Status.CANCEL_SCHEDULED && !s.periodEnd().isAfter(now) && !renewalPending) {
            return Status.NONE;
        }
        return s.status();
    }

    static boolean isPro(Status status) {
        return status == Status.ACTIVE || status == Status.CANCEL_SCHEDULED;
    }

    // 사용자 행을 잠근 트랜잭션에서 work를 실행한다. 그사이 탈퇴해 사용자가 없으면 null.
    <T> T locked(long userId, Function<Long, T> work) {
        return transactions.execute(status -> repo.lockUser(userId) ? work.apply(userId) : null);
    }

    // 결과 모름 결제를 포트원에 조회해 반영한다. allowResend면 포트원에 없을 때 같은 결제 ID로 다시 보낸다.
    // keepKey는 지우지 않을 빌링키(이번 요청의 카드)다. 포트원이 응답하지 않으면 UnavailableException.
    Resolution resolve(String paymentId, String keepKey, boolean allowResend) {
        Payment payment = repo.findPayment(paymentId).orElse(null);
        if (payment == null) {
            return Resolution.UNKNOWN;
        }
        PaymentInfo info = portone.findPayment(paymentId);
        return switch (info.status()) {
            case PAID -> applyQueriedPaid(payment, info, keepKey);
            case FAILED -> applyFailure(payment, false, keepKey);
            case CANCELLED -> applyCancelled(payment, keepKey);
            case IN_PROGRESS -> Resolution.UNKNOWN;
            case NOT_FOUND -> allowResend ? resend(payment, keepKey) : Resolution.UNKNOWN;
        };
    }

    // 포트원에 결제 ID가 없다(요청이 아직 닿지 않음). 실패로 보지 않고 같은 결제 ID로 다시 보낸다.
    // 포트원은 같은 결제 ID로 두 번 결제하지 않는다. 끝난 구독의 갱신 결제는 다시 보내지 않고 실패로 닫는다.
    private Resolution resend(Payment payment, String keepKey) {
        // 잠금 안에서 기록이 아직 PENDING인지 다시 본다. 조회 목록을 가져간 뒤 다른 요청이 닫았으면 보내지 않는다.
        Boolean send = locked(payment.userId(), userId -> {
            Payment fresh = repo.findPayment(payment.paymentId()).orElse(null);
            return fresh != null && fresh.status() == PayStatus.PENDING
                    && !(fresh.kind() == Kind.RENEWAL && endedSubscription(fresh));
        });
        if (send == null) {
            return Resolution.UNKNOWN;
        }
        if (!send) {
            // 끝난 구독의 갱신 결제는 실패로 닫고, 이미 닫힌 기록은 그 상태를 돌려준다.
            return applyFailure(payment, false, keepKey);
        }
        String customerId = repo.findCustomerId(payment.userId()).orElse(null);
        if (customerId == null) {
            return Resolution.UNKNOWN;
        }
        PayResult result = portone.payWithBillingKey(payment.paymentId(), payment.billingKey(), customerId,
                payment.cycle().orderName, payment.amount());
        return applyPayResult(payment, result, keepKey);
    }

    // 서버가 보낸 결제 요청의 응답을 반영한다. '이미 결제됐거나 진행 중' 답과 응답 없음은 결제 ID로 한 번 조회해 따른다.
    // 조회도 실패하면 결과 모름이다(openapi startSubscription).
    Resolution applyPayResult(Payment payment, PayResult result, String keepKey) {
        return switch (result) {
            case PortOneClient.Paid paid -> applyPaid(payment, paid.paidAt(), keepKey);
            case PortOneClient.Declined declined -> applyFailure(payment, false, keepKey);
            case PortOneClient.AlreadyUsed already -> requery(payment, keepKey);
            case PortOneClient.Unknown unknown -> requery(payment, keepKey);
        };
    }

    private Resolution requery(Payment payment, String keepKey) {
        try {
            return resolve(payment.paymentId(), keepKey, false);
        } catch (PortOneClient.UnavailableException e) {
            return Resolution.UNKNOWN;
        }
    }

    // 조회로 알게 된 '결제됨'은 금액·통화·빌링키를 결제 기록과 대조한 뒤에만 성공으로 확정한다.
    private Resolution applyQueriedPaid(Payment payment, PaymentInfo info, String keepKey) {
        boolean matches = info.amount() == payment.amount() && "KRW".equals(info.currency())
                && Objects.equals(info.billingKey(), payment.billingKey());
        if (!matches) {
            log.error("포트원 결제 내용이 결제 기록과 다르다 {}: amount={} currency={} billingKey 같음={}", payment.paymentId(),
                    info.amount(), info.currency(), Objects.equals(info.billingKey(), payment.billingKey()));
            return mismatch(payment, info.paidAt(), keepKey);
        }
        return applyPaid(payment, info.paidAt(), keepKey);
    }

    // 결제됨을 반영한다. 첫 결제면 구독을 시작하고 갱신이면 기간을 한 번 늘린다.
    // 이미 실패·취소로 닫은 결제가 늦게 결제됐거나, 환불로 끝난 구독의 갱신이면 반영하지 않고 '취소 필요'로 표시한다.
    Resolution applyPaid(Payment payment, Instant paidAt, String keepKey) {
        Instant at = paidAt == null ? Instant.now() : paidAt;
        Resolution resolution = locked(payment.userId(), userId -> {
            Payment fresh = repo.findPayment(payment.paymentId()).orElse(null);
            if (fresh == null) {
                return Resolution.UNKNOWN;
            }
            if (fresh.status() == PayStatus.PAID) {
                return fresh.needsCancel() ? Resolution.PAID_NOT_APPLIED : Resolution.PAID_APPLIED;
            }
            if (fresh.status() != PayStatus.PENDING) {
                return null;   // 늦게 결제됨. 잠금 밖에서 다시 조회한 뒤 표시한다.
            }
            Optional<Sub> sub = repo.findSub(userId);
            Status status = effective(sub, Optional.of(fresh), Instant.now());
            if (fresh.kind() == Kind.FIRST) {
                if (isPro(status)) {
                    return notApplied(fresh, at);
                }
                String oldKey = sub.map(Sub::billingKey).orElse(null);
                repo.startSub(userId, fresh.cycle(), fresh.billingKey(), at, fresh.paymentId());
                if (repo.isSuspended(userId)) {
                    // 결과를 기다리는 사이 정지됐다. 정지 때와 같이 해지 예정으로 둔다(낸 기간만 쓰고 갱신하지 않는다).
                    repo.setStatus(userId, Status.CANCEL_SCHEDULED);
                }
                repo.updatePayment(fresh.paymentId(), PayStatus.PAID, false, at);
                if (oldKey != null && !oldKey.equals(fresh.billingKey())) {
                    repo.queueKeyDeletion(oldKey);
                }
                return Resolution.PAID_APPLIED;
            }
            if (!isPro(status)) {
                return notApplied(fresh, at);
            }
            repo.extendSub(sub.get(), fresh.cycle(), fresh.paymentId());
            repo.updatePayment(fresh.paymentId(), PayStatus.PAID, false, at);
            return Resolution.PAID_APPLIED;
        });
        if (resolution != null) {
            return resolution;
        }
        return lateRecheck(payment, at);
    }

    // 이미 실패·취소로 닫은 결제가 결제됨으로 나왔다. 잠금을 기다리는 사이 운영자가 취소했을 수 있어 잠금 밖에서 다시 조회하고,
    // 지금도 결제됨일 때만 표시한다. 조회가 실패하면 표시한다(운영자가 콘솔에서 확인).
    private Resolution lateRecheck(Payment payment, Instant paidAt) {
        boolean stillPaid;
        try {
            stillPaid = portone.findPayment(payment.paymentId()).status() == PortOneClient.PaymentStatus.PAID;
        } catch (PortOneClient.UnavailableException e) {
            stillPaid = true;
        }
        if (!stillPaid) {
            return Resolution.FAILED;
        }
        Resolution resolution = locked(payment.userId(), userId -> {
            Payment fresh = repo.findPayment(payment.paymentId()).orElse(null);
            if (fresh == null || fresh.status() == PayStatus.PENDING) {
                return Resolution.UNKNOWN;
            }
            if (fresh.status() == PayStatus.PAID) {
                return fresh.needsCancel() ? Resolution.PAID_NOT_APPLIED : Resolution.PAID_APPLIED;
            }
            if (fresh.status() == PayStatus.CANCELLED) {
                return Resolution.FAILED;   // 그사이 취소 웹훅이 반영됐다(운영자 환불).
            }
            return notApplied(fresh, paidAt);
        });
        return resolution == null ? Resolution.UNKNOWN : resolution;
    }

    // 돈은 나갔는데 구독에 반영하지 않는다. 운영자가 콘솔에서 취소하면 취소 웹훅으로 표시가 풀린다.
    private Resolution notApplied(Payment payment, Instant paidAt) {
        log.error("구독에 반영하지 않은 결제(취소 필요) {} 사용자 {}", payment.paymentId(), payment.userId());
        repo.updatePayment(payment.paymentId(), PayStatus.PAID, true, paidAt);
        dropKey(payment.userId(), payment.billingKey(), null);
        return Resolution.PAID_NOT_APPLIED;
    }

    // 대조가 어긋났다. 결제 실패와 똑같이 처리하고, 돈이 나갔으므로 '취소 필요'로 표시한다.
    private Resolution mismatch(Payment payment, Instant paidAt, String keepKey) {
        Resolution resolution = locked(payment.userId(), userId -> {
            Payment fresh = repo.findPayment(payment.paymentId()).orElse(null);
            if (fresh == null || fresh.status() != PayStatus.PENDING) {
                return Resolution.FAILED;
            }
            repo.updatePayment(fresh.paymentId(), PayStatus.PAID, true, paidAt);
            failSubscription(fresh, keepKey);
            return Resolution.PAID_NOT_APPLIED;
        });
        return resolution == null ? Resolution.UNKNOWN : resolution;
    }

    // 실패(또는 결과 모름 결제의 취소)를 반영한다. 프로를 준 적이 없는 결제라 실패와 같다.
    Resolution applyFailure(Payment payment, boolean cancelled, String keepKey) {
        Resolution resolution = locked(payment.userId(), userId -> {
            Payment fresh = repo.findPayment(payment.paymentId()).orElse(null);
            if (fresh == null) {
                return Resolution.UNKNOWN;
            }
            if (fresh.status() == PayStatus.PAID) {
                return fresh.needsCancel() ? Resolution.PAID_NOT_APPLIED : Resolution.PAID_APPLIED;
            }
            if (fresh.status() != PayStatus.PENDING) {
                return Resolution.FAILED;
            }
            repo.updatePayment(fresh.paymentId(), cancelled ? PayStatus.CANCELLED : PayStatus.FAILED, false, null);
            failSubscription(fresh, keepKey);
            return Resolution.FAILED;
        });
        return resolution == null ? Resolution.UNKNOWN : resolution;
    }

    // 결제가 실패했을 때 구독과 카드를 정리한다. 갱신이면 진행 중은 결제 실패, 해지 예정은 바로 NONE이 된다.
    // 실패한 카드는 지운다(환불 정책 4절 1항). 쓰는 중인 카드와 이번 요청의 카드는 지우지 않는다.
    private void failSubscription(Payment payment, String keepKey) {
        if (payment.kind() == Kind.RENEWAL) {
            Optional<Sub> sub = repo.findSub(payment.userId());
            if (sub.isPresent() && isPro(sub.get().status())) {
                Status next = sub.get().status() == Status.ACTIVE ? Status.PAYMENT_FAILED : Status.NONE;
                repo.setStatus(payment.userId(), next);
                repo.setCycle(payment.userId(), payment.cycle());
            }
        }
        dropKey(payment.userId(), payment.billingKey(), keepKey);
    }

    // 결제됐던 결제가 취소됐다(운영자 환불). 그 구독의 기간을 시작하거나 늘린 마지막 결제일 때만 구독을 바로 끝낸다.
    // 결과 모름 결제의 취소는 실패와 같다.
    private Resolution applyCancelled(Payment payment, String keepKey) {
        Resolution resolution = locked(payment.userId(), userId -> {
            Payment fresh = repo.findPayment(payment.paymentId()).orElse(null);
            if (fresh == null) {
                return Resolution.UNKNOWN;
            }
            switch (fresh.status()) {
                case PENDING -> {
                    repo.updatePayment(fresh.paymentId(), PayStatus.CANCELLED, false, null);
                    failSubscription(fresh, keepKey);
                }
                case PAID -> {
                    repo.updatePayment(fresh.paymentId(), PayStatus.CANCELLED, false, null);
                    Optional<Sub> sub = repo.findSub(userId);
                    if (sub.isPresent() && fresh.paymentId().equals(sub.get().lastAppliedPaymentId())
                            && isPro(sub.get().status())) {
                        endSubscription(sub.get());
                    }
                }
                case FAILED -> {
                    // 실패로 닫은 뒤 늦게 결제됐다가 취소됐다. 취소됨으로 바꿔 두면 늦게 도는 lateRecheck가 '취소 필요'로 표시하지 않는다.
                    repo.updatePayment(fresh.paymentId(), PayStatus.CANCELLED, false, null);
                }
                case CANCELLED -> {
                    // 이미 취소로 반영했다.
                }
            }
            return Resolution.FAILED;
        });
        return resolution == null ? Resolution.UNKNOWN : resolution;
    }

    // 구독을 끝내고(NONE) 카드를 지운다. 다시 구독하면 카드를 새로 등록한다.
    void endSubscription(Sub sub) {
        String key = sub.billingKey();
        repo.setStatus(sub.userId(), Status.NONE);
        dropKey(sub.userId(), key, null);
    }

    // 쓰지 않는 카드를 지울 목록에 넣는다. 구독이나 결과 모름 결제가 쓰는 카드, keepKey는 지우지 않는다.
    void dropKey(long userId, String billingKey, String keepKey) {
        if (billingKey == null || billingKey.equals(keepKey) || repo.isKeyInUse(userId, billingKey)
                || repo.isKeyQueued(billingKey)) {
            return;
        }
        repo.queueKeyDeletion(billingKey);
    }

    private boolean endedSubscription(Payment payment) {
        Optional<Sub> sub = repo.findSub(payment.userId());
        return sub.isEmpty() || !isPro(sub.get().status());
    }
}
