package com.codingmon.api.subscription;

import java.time.Instant;
import java.util.Optional;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.ErrorResponseException;

import com.codingmon.api.ApiErrors;
import com.codingmon.api.subscription.PaymentResolver.Resolution;
import com.codingmon.api.subscription.PortOneClient.KeyOwner;
import com.codingmon.api.subscription.PortOneClient.PayResult;
import com.codingmon.api.subscription.SubscriptionRepository.Cycle;
import com.codingmon.api.subscription.SubscriptionRepository.Kind;
import com.codingmon.api.subscription.SubscriptionRepository.Payment;
import com.codingmon.api.subscription.SubscriptionRepository.PayStatus;
import com.codingmon.api.subscription.SubscriptionRepository.Status;
import com.codingmon.api.subscription.SubscriptionRepository.Sub;
import com.codingmon.api.subscription.Subscriptions.View;

// 내 구독(MY-06)과 구독 시작(PAY-01·02). 처리 순서는 openapi startSubscription의 1~5단계와 같다.
@Service
class SubscriptionService {

    // 남은 결과 모름 결제를 정리하고 2단계로 돌아가는 횟수 상한. 정상이면 한 번이면 끝난다.
    private static final int MAX_ROUNDS = 3;

    private final SubscriptionRepository repo;
    private final PortOneClient portone;
    private final PaymentResolver resolver;
    private final Subscriptions subscriptions;

    SubscriptionService(SubscriptionRepository repo, PortOneClient portone, PaymentResolver resolver,
            Subscriptions subscriptions) {
        this.repo = repo;
        this.portone = portone;
        this.resolver = resolver;
        this.subscriptions = subscriptions;
    }

    View find(long userId) {
        return subscriptions.view(userId, repo.ensureCustomerId(userId));
    }

    private sealed interface Step permits AlreadyPro, Leftover, NewPayment {
    }

    private record AlreadyPro() implements Step {
    }

    private record Leftover(Payment payment) implements Step {
    }

    private record NewPayment(Payment payment) implements Step {
    }

    View start(long userId, String billingKey, Cycle cycle, Boolean agreed) {
        if (!portone.isConfigured()) {
            throw providerUnavailable();
        }
        String customerId = repo.ensureCustomerId(userId);
        // 1. 빌링키 확인(잠금 밖)
        KeyOwner owner;
        try {
            owner = portone.checkBillingKey(billingKey, customerId);
        } catch (PortOneClient.UnavailableException e) {
            throw providerUnavailable();
        }
        if (owner != KeyOwner.MATCH || repo.isKeyQueued(billingKey)) {
            throw ApiErrors.error(HttpStatus.BAD_REQUEST, "BILLING_KEY_INVALID", "등록한 카드를 확인할 수 없어요. 카드를 다시 등록해 주세요");
        }
        if (!Boolean.TRUE.equals(agreed)) {
            resolver.locked(userId, id -> {
                resolver.dropKey(id, billingKey, null);
                return true;
            });
            throw ApiErrors.error(HttpStatus.BAD_REQUEST, "AGREEMENT_REQUIRED", "약관과 자동결제에 동의해야 결제할 수 있어요");
        }
        for (int round = 0; round < MAX_ROUNDS; round++) {
            // 2. 사용자 행을 잠그고 프로·남은 결제를 확인한다. 둘 다 아니면 결제 기록을 PENDING으로 먼저 저장한다.
            Step step = resolver.locked(userId, id -> {
                Optional<Sub> sub = repo.findSub(id);
                Optional<Payment> pending = repo.findPending(id);
                if (PaymentResolver.isPro(PaymentResolver.effective(sub, pending, Instant.now()))) {
                    return new AlreadyPro();
                }
                if (pending.isPresent()) {
                    return new Leftover(pending.get());
                }
                Payment payment = new Payment(SubscriptionRepository.newPaymentId(), id, Kind.FIRST, cycle, cycle.amount,
                        billingKey, PayStatus.PENDING, false, null, null);
                repo.insertPayment(payment);
                return new NewPayment(payment);
            });
            if (step == null) {
                throw new ErrorResponseException(HttpStatus.UNAUTHORIZED);
            }
            switch (step) {
                case AlreadyPro already -> {
                    dropUnused(userId, billingKey);
                    throw ApiErrors.error(HttpStatus.CONFLICT, "SUBSCRIPTION_ALREADY_ACTIVE", "이미 프로 구독 중이에요");
                }
                case Leftover leftover -> {
                    // 3. 남은 결제를 조회해 정리한다. 결제됐으면 새로 결제하지 않고 그 결제로 구독을 시작한다.
                    Resolution resolution = resolveQuietly(leftover.payment().paymentId(), billingKey);
                    if (resolution == Resolution.PAID_APPLIED && leftover.payment().kind() == Kind.FIRST) {
                        dropUnused(userId, billingKey);
                        return subscriptions.view(userId, customerId);
                    }
                    if (resolution == Resolution.UNKNOWN) {
                        dropUnused(userId, billingKey);
                        throw paymentUnavailable();
                    }
                    // 실패·취소로 닫았거나 반영하지 않는 결제였다. 이번 요청으로 새로 결제한다.
                }
                case NewPayment created -> {
                    // 4. 결제. 5. 결과 반영
                    Payment payment = created.payment();
                    PayResult result = portone.payWithBillingKey(payment.paymentId(), billingKey, customerId, cycle.orderName,
                            cycle.amount);
                    Resolution resolution = resolver.applyPayResult(payment, result, null);
                    if (resolution == Resolution.PAID_APPLIED) {
                        return subscriptions.view(userId, customerId);
                    }
                    if (resolution == Resolution.UNKNOWN) {
                        throw paymentUnavailable();
                    }
                    String reason = result instanceof PortOneClient.Declined declined ? declined.reason() : "카드 결제에 실패했어요";
                    throw ApiErrors.error(HttpStatus.PAYMENT_REQUIRED, "PAYMENT_FAILED", reason);
                }
            }
        }
        dropUnused(userId, billingKey);
        throw paymentUnavailable();
    }

    View cancel(long userId) {
        return change(userId, (sub, status) -> {
            if (status == Status.CANCEL_SCHEDULED) {
                return;
            }
            if (status != Status.ACTIVE) {
                throw notActive();
            }
            // 바꿔 둔 다음 주기도 함께 취소된다.
            repo.setStatus(sub.userId(), Status.CANCEL_SCHEDULED);
        });
    }

    // 끝난 구독(기간이 지난 해지 예정)은 effective가 NONE이라 409다. 동의 없이 갱신 결제가 일어나지 않게 한다.
    View resume(long userId) {
        return change(userId, (sub, status) -> {
            if (status == Status.ACTIVE) {
                return;
            }
            if (status != Status.CANCEL_SCHEDULED) {
                throw notActive();
            }
            repo.setStatus(sub.userId(), Status.ACTIVE);
        });
    }

    // 다음 갱신 결제부터 쓸 주기. 비교 기준은 결과 모름 갱신이 있으면 그 결제의 주기, 없으면 cycle이다.
    View changeCycle(long userId, Cycle cycle, Boolean agreed) {
        return change(userId, (sub, status) -> {
            if (status != Status.ACTIVE) {
                throw notActive();
            }
            Cycle current = repo.findPending(userId).filter(p -> p.kind() == Kind.RENEWAL).map(Payment::cycle)
                    .orElse(sub.cycle());
            if (cycle == current) {
                repo.setNextCycle(userId, null);
                return;
            }
            if (!Boolean.TRUE.equals(agreed)) {
                throw ApiErrors.error(HttpStatus.BAD_REQUEST, "AGREEMENT_REQUIRED", "바뀐 금액의 자동결제에 동의해야 바꿀 수 있어요");
            }
            repo.setNextCycle(userId, cycle);
        });
    }

    private interface Change {
        void apply(Sub sub, Status effective);
    }

    private View change(long userId, Change change) {
        Boolean done = resolver.locked(userId, id -> {
            Optional<Sub> sub = repo.findSub(id);
            Status status = PaymentResolver.effective(sub, repo.findPending(id), Instant.now());
            if (sub.isEmpty()) {
                throw notActive();
            }
            change.apply(sub.get(), status);
            return true;
        });
        if (done == null) {
            throw new ErrorResponseException(HttpStatus.UNAUTHORIZED);
        }
        return find(userId);
    }

    private Resolution resolveQuietly(String paymentId, String keepKey) {
        try {
            return resolver.resolve(paymentId, keepKey, true);
        } catch (PortOneClient.UnavailableException e) {
            return Resolution.UNKNOWN;
        }
    }

    // 이번 요청의 빌링키를 결제에 쓰지 않고 끝났다. 쓰는 중인 카드(같은 요청을 다시 보낸 경우)는 지우지 않는다.
    private void dropUnused(long userId, String billingKey) {
        resolver.locked(userId, id -> {
            resolver.dropKey(id, billingKey, null);
            return true;
        });
    }

    private static ErrorResponseException notActive() {
        return ApiErrors.error(HttpStatus.CONFLICT, "SUBSCRIPTION_NOT_ACTIVE", "진행 중인 프로 구독이 없어요");
    }

    private static ErrorResponseException providerUnavailable() {
        return ApiErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "PAYMENT_PROVIDER_UNAVAILABLE",
                "결제 서비스에 잠시 연결할 수 없어요. 이번 요청은 결제되지 않았어요. 잠시 뒤 다시 시도해 주세요");
    }

    private static ErrorResponseException paymentUnavailable() {
        return ApiErrors.error(HttpStatus.SERVICE_UNAVAILABLE, "PAYMENT_UNAVAILABLE",
                "결제 결과를 확인하고 있어요. 잠시 뒤 마이페이지 구독에서 확인해 주세요");
    }
}
