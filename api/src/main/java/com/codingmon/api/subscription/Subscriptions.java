package com.codingmon.api.subscription;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import com.codingmon.api.subscription.SubscriptionRepository.Cycle;
import com.codingmon.api.subscription.SubscriptionRepository.Kind;
import com.codingmon.api.subscription.SubscriptionRepository.Payment;
import com.codingmon.api.subscription.SubscriptionRepository.PayStatus;
import com.codingmon.api.subscription.SubscriptionRepository.Status;
import com.codingmon.api.subscription.SubscriptionRepository.Sub;

// 다른 패키지(탈퇴·정지·관리자 회원 화면)가 구독을 읽고 바꿀 때 쓰는 입구.
@Component
public class Subscriptions {

    public enum Plan { FREE, PRO }

    // openapi Subscription. 결과 모름 갱신이 있으면 cycle·currentPeriodEnd는 그 결제가 됐을 때의 값이다(보여 주기만).
    public record View(Plan plan, Status status, Cycle cycle, Cycle nextCycle, Instant currentPeriodEnd,
            boolean paymentPending, String customerId) {
    }

    // openapi AdminPayment
    public record AdminPayment(String paymentId, Instant paidAt, int amount, Cycle cycle, PayStatus status,
            boolean needsCancel) {
    }

    // openapi AdminUserDetail의 구독 부분
    public record AdminDetail(Instant subscriptionStartedAt, Integer refundAmount, List<AdminPayment> payments) {
    }

    private final SubscriptionRepository repo;
    private final JdbcClient jdbc;
    // 구독과 남은 결제를 같은 시점으로 읽는다. 따로 읽으면 그 사이 반영된 갱신 때문에 잠깐 NONE으로 보일 수 있다.
    private final TransactionTemplate snapshot;

    Subscriptions(SubscriptionRepository repo, JdbcClient jdbc, PlatformTransactionManager transactionManager) {
        this.repo = repo;
        this.jdbc = jdbc;
        this.snapshot = new TransactionTemplate(transactionManager);
        snapshot.setReadOnly(true);
        snapshot.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    View view(long userId, String customerId) {
        return snapshot.execute(status -> readView(userId, customerId));
    }

    private View readView(long userId, String customerId) {
        Optional<Sub> sub = repo.findSub(userId);
        Optional<Payment> pending = repo.findPending(userId);
        Status status = PaymentResolver.effective(sub, pending, Instant.now());
        boolean pro = PaymentResolver.isPro(status);
        Payment renewal = pending.filter(p -> p.kind() == Kind.RENEWAL && pro).orElse(null);
        Cycle cycle = status == Status.NONE ? null : renewal != null ? renewal.cycle() : sub.get().cycle();
        Instant periodEnd = !pro ? null
                : renewal != null ? SubscriptionRepository.periodEnd(sub.get().anchorAt(), sub.get().months() + renewal.cycle().months)
                : sub.get().periodEnd();
        // 확정되면 프로가 되는 결제만 센다. 환불로 끝난 구독의 갱신 결제는 확정돼도 프로를 주지 않는다.
        boolean paymentPending = pending.isPresent() && (pending.get().kind() == Kind.FIRST || pro);
        return new View(pro ? Plan.PRO : Plan.FREE, status, cycle, status == Status.ACTIVE ? sub.get().nextCycle() : null,
                periodEnd, paymentPending, customerId);
    }

    // 관리자 회원 목록·상세용. 고객 ID를 만들지 않는다(없으면 null).
    public View adminView(long userId) {
        return view(userId, repo.findCustomerId(userId).orElse(null));
    }

    public AdminDetail adminDetail(long userId) {
        return snapshot.execute(status -> readAdminDetail(userId));
    }

    private AdminDetail readAdminDetail(long userId) {
        Optional<Sub> sub = repo.findSub(userId);
        Optional<Payment> pending = repo.findPending(userId);
        Instant now = Instant.now();
        Status status = PaymentResolver.effective(sub, pending, now);
        List<Payment> payments = repo.findPayments(userId);
        Instant startedAt = status == Status.NONE ? null : sub.get().anchorAt();
        Integer refund = PaymentResolver.isPro(status) && pending.isEmpty() ? refundAmount(sub.get(), payments, now) : null;
        return new AdminDetail(startedAt, refund, payments.stream()
                .map(p -> new AdminPayment(p.paymentId(), p.paidAt(), p.amount(), p.cycle(), p.status(), p.needsCancel()))
                .toList());
    }

    // 연간 중도 해지 환불(환불 정책 2절 3항): 남은 기간의 금액에서 10%를 빼고 10원 미만은 버린다.
    // 지금 기간의 확정된 결제와 저장된 기간으로 센다. 남은 일수는 한국 시간 날짜로, 오늘을 빼고 기간이 끝나는 날까지다.
    static Integer refundAmount(Sub sub, List<Payment> payments, Instant now) {
        if (sub.cycle() != Cycle.YEARLY || !sub.periodEnd().isAfter(now)) {
            return null;
        }
        Payment last = payments.stream().filter(p -> p.paymentId().equals(sub.lastAppliedPaymentId())
                && p.status() == PayStatus.PAID).findFirst().orElse(null);
        if (last == null || last.cycle() != Cycle.YEARLY) {
            return null;
        }
        LocalDate end = sub.periodEnd().atZone(SubscriptionRepository.SEOUL).toLocalDate();
        LocalDate start = SubscriptionRepository.periodEnd(sub.anchorAt(), sub.months() - Cycle.YEARLY.months)
                .atZone(SubscriptionRepository.SEOUL).toLocalDate();
        long total = ChronoUnit.DAYS.between(start, end);
        long remaining = ChronoUnit.DAYS.between(now.atZone(SubscriptionRepository.SEOUL).toLocalDate(), end);
        if (total <= 0 || remaining <= 0) {
            return null;
        }
        // 남은 금액 × 90%를 분수 그대로 계산하고 마지막에 한 번만 10원 단위로 버린다.
        return (int) ((long) last.amount() * remaining * 9 / (total * 10) / 10 * 10);
    }

    // 탈퇴(MY-04, ADM-16 강제 탈퇴). 회원 행을 지우기 전에 같은 트랜잭션에서 부른다.
    // 이 고객 ID의 빌링키를 모두 지울 목록에 넣는다. 구독·결제 기록은 회원 행과 함께 지워진다(FK).
    public void onWithdraw(long userId) {
        repo.queueCustomerDeletion(userId);
    }

    // 계정 정지(ADM-16). 정지된 회원은 해지할 수 없으므로 진행 중 구독을 해지와 똑같이 해지 예정으로 바꾼다.
    // 사용자 행을 이미 잠근 정지 트랜잭션에서 부른다. 정지를 풀어도 되돌리지 않는다.
    public void onSuspend(long userId) {
        jdbc.sql("update subscriptions set status = 'CANCEL_SCHEDULED', next_cycle = null, updated_at = now()"
                + " where user_id = :id and status = 'ACTIVE'").param("id", userId).update();
    }
}
