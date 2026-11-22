package com.codingmon.api.subscription;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// 구독·결제 기록·지울 빌링키(V12). 바꾸는 메서드는 모두 사용자 행을 잠근 트랜잭션 안에서 부른다(lockUser).
@Repository
public class SubscriptionRepository {

    static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    public enum Cycle {
        MONTHLY(1, 9_900, "코딩몬 프로 월간"), YEARLY(12, 99_000, "코딩몬 프로 연간");

        final int months;
        final int amount;
        final String orderName;

        Cycle(int months, int amount, String orderName) {
            this.months = months;
            this.amount = amount;
            this.orderName = orderName;
        }
    }

    public enum Status { NONE, ACTIVE, CANCEL_SCHEDULED, PAYMENT_FAILED }

    enum Kind { FIRST, RENEWAL }

    public enum PayStatus { PENDING, PAID, FAILED, CANCELLED }

    record Sub(long userId, Status status, Cycle cycle, Cycle nextCycle, String billingKey, Instant anchorAt, int months,
            Instant periodEnd, String lastAppliedPaymentId) {
    }

    record Payment(String paymentId, long userId, Kind kind, Cycle cycle, int amount, String billingKey, PayStatus status,
            boolean needsCancel, Instant paidAt, Instant createdAt) {
    }

    record Deletion(long id, String billingKey, String customerId, Instant customerSince) {
    }

    private static final String SUB_COLUMNS = "select user_id, status, cycle, next_cycle, billing_key, anchor_at, months,"
            + " current_period_end, last_applied_payment_id from subscriptions";
    private static final String PAYMENT_COLUMNS = "select payment_id, user_id, kind, cycle, amount, billing_key, status,"
            + " needs_cancel, paid_at, created_at from payments";

    private final JdbcClient jdbc;

    SubscriptionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 기준 시각에 개월 수를 한국 시간으로 더한다. 그 달에 같은 날이 없으면 말일이다(1/31 → 2/28 → 3/31).
    static Instant periodEnd(Instant anchorAt, int months) {
        return anchorAt.atZone(SEOUL).plusMonths(months).toInstant();
    }

    static String newPaymentId() {
        return "pay-" + UUID.randomUUID();
    }

    // 결제 시작·결과 반영·웹훅·해지·스케줄러·탈퇴가 모두 이 행을 잠가 차례로 처리된다. 사용자가 없으면 false.
    boolean lockUser(long userId) {
        return jdbc.sql("select id from users where id = :id for update").param("id", userId).query(Long.class).optional()
                .isPresent();
    }

    boolean isSuspended(long userId) {
        return jdbc.sql("select suspended_at is not null from users where id = :id").param("id", userId)
                .query(Boolean.class).optional().orElse(false);
    }

    // 비어 있을 때만 저장한다. 동시에 처음 만든 요청은 저장하지 못하고 이미 저장된 값을 읽는다.
    String ensureCustomerId(long userId) {
        jdbc.sql("update users set customer_id = :customerId, customer_id_created_at = now()"
                + " where id = :id and customer_id is null")
                .param("customerId", "cus-" + UUID.randomUUID()).param("id", userId).update();
        return findCustomerId(userId).orElseThrow();
    }

    Optional<String> findCustomerId(long userId) {
        return jdbc.sql("select customer_id from users where id = :id and customer_id is not null").param("id", userId)
                .query(String.class).optional();
    }

    Optional<Sub> findSub(long userId) {
        return jdbc.sql(SUB_COLUMNS + " where user_id = :id").param("id", userId).query((rs, n) -> sub(rs)).optional();
    }

    Optional<Payment> findPending(long userId) {
        return jdbc.sql(PAYMENT_COLUMNS + " where user_id = :id and status = 'PENDING'").param("id", userId)
                .query((rs, n) -> payment(rs)).optional();
    }

    Optional<Payment> findPayment(String paymentId) {
        return jdbc.sql(PAYMENT_COLUMNS + " where payment_id = :id").param("id", paymentId).query((rs, n) -> payment(rs))
                .optional();
    }

    List<Payment> findPayments(long userId) {
        return jdbc.sql(PAYMENT_COLUMNS + " where user_id = :id order by paid_at desc, created_at desc").param("id", userId)
                .query((rs, n) -> payment(rs)).list();
    }

    void insertPayment(Payment p) {
        jdbc.sql("insert into payments (payment_id, user_id, kind, cycle, amount, billing_key, status, paid_at)"
                + " values (:paymentId, :userId, :kind, :cycle, :amount, :billingKey, 'PENDING', now())")
                .param("paymentId", p.paymentId()).param("userId", p.userId()).param("kind", p.kind().name())
                .param("cycle", p.cycle().name()).param("amount", p.amount()).param("billingKey", p.billingKey()).update();
    }

    void updatePayment(String paymentId, PayStatus status, boolean needsCancel, Instant paidAt) {
        jdbc.sql("update payments set status = :status, needs_cancel = :needsCancel, paid_at = coalesce(:paidAt, paid_at)"
                + " where payment_id = :id")
                .param("status", status.name()).param("needsCancel", needsCancel).param("paidAt", utc(paidAt))
                .param("id", paymentId).update();
    }

    void markNeedsCancel(String paymentId) {
        jdbc.sql("update payments set needs_cancel = true where payment_id = :id").param("id", paymentId).update();
    }

    // 구독을 새로 시작한다(처음이든 다시 구독이든). 기준 시각과 개월 수를 새로 센다.
    void startSub(long userId, Cycle cycle, String billingKey, Instant anchorAt, String paymentId) {
        jdbc.sql("insert into subscriptions (user_id, status, cycle, next_cycle, billing_key, anchor_at, months,"
                + " current_period_end, last_applied_payment_id)"
                + " values (:userId, 'ACTIVE', :cycle, null, :key, :anchor, :months, :end, :paymentId)"
                + " on conflict (user_id) do update set status = 'ACTIVE', cycle = excluded.cycle, next_cycle = null,"
                + " billing_key = excluded.billing_key, anchor_at = excluded.anchor_at, months = excluded.months,"
                + " current_period_end = excluded.current_period_end,"
                + " last_applied_payment_id = excluded.last_applied_payment_id, updated_at = now()")
                .param("userId", userId).param("cycle", cycle.name()).param("key", billingKey)
                .param("anchor", utc(anchorAt)).param("months", cycle.months)
                .param("end", utc(periodEnd(anchorAt, cycle.months))).param("paymentId", paymentId).update();
    }

    // 갱신 결제가 확정됐다. 그 결제 기록의 주기로 cycle을 바꾸고 기간을 한 번 늘린다.
    void extendSub(Sub sub, Cycle cycle, String paymentId) {
        int months = sub.months() + cycle.months;
        jdbc.sql("update subscriptions set cycle = :cycle, months = :months, current_period_end = :end,"
                + " last_applied_payment_id = :paymentId, updated_at = now() where user_id = :userId")
                .param("cycle", cycle.name()).param("months", months).param("end", utc(periodEnd(sub.anchorAt(), months)))
                .param("paymentId", paymentId).param("userId", sub.userId()).update();
    }

    // 상태만 바꾼다. 진행 중이 아니면 다음 주기를 비우고, NONE·PAYMENT_FAILED면 카드도 비운다(카드는 호출한 쪽이 지울 목록에 넣는다).
    void setStatus(long userId, Status status) {
        boolean keepKey = status == Status.ACTIVE || status == Status.CANCEL_SCHEDULED;
        jdbc.sql("update subscriptions set status = :status,"
                + " next_cycle = case when :status = 'ACTIVE' then next_cycle else null end,"
                + " billing_key = case when :keepKey then billing_key else null end, updated_at = now()"
                + " where user_id = :userId")
                .param("status", status.name()).param("keepKey", keepKey).param("userId", userId).update();
    }

    // 결제 실패 상태의 cycle은 실패한 갱신 결제의 주기다(관리자 목록 '프로 월간 [결제 실패]').
    void setCycle(long userId, Cycle cycle) {
        jdbc.sql("update subscriptions set cycle = :cycle where user_id = :userId")
                .param("cycle", cycle.name()).param("userId", userId).update();
    }

    void setNextCycle(long userId, Cycle nextCycle) {
        jdbc.sql("update subscriptions set next_cycle = :next, updated_at = now() where user_id = :userId")
                .param("next", nextCycle == null ? null : nextCycle.name()).param("userId", userId).update();
    }

    // 쓰는 중인 빌링키(구독이나 결과 모름 결제의 카드)인지.
    boolean isKeyInUse(long userId, String billingKey) {
        return jdbc.sql("select exists (select 1 from subscriptions where user_id = :id and billing_key = :key)"
                + " or exists (select 1 from payments where user_id = :id and status = 'PENDING' and billing_key = :key)")
                .param("id", userId).param("key", billingKey).query(Boolean.class).single();
    }

    // 지우기 직전에 다시 확인한다. 목록에 넣은 뒤 그 카드로 결제가 시작됐을 수 있다.
    boolean isKeyInUseAnywhere(String billingKey) {
        return jdbc.sql("select exists (select 1 from subscriptions where billing_key = :key)"
                + " or exists (select 1 from payments where status = 'PENDING' and billing_key = :key)")
                .param("key", billingKey).query(Boolean.class).single();
    }

    boolean isKeyQueued(String billingKey) {
        return jdbc.sql("select exists (select 1 from billing_key_deletions where billing_key = :key)")
                .param("key", billingKey).query(Boolean.class).single();
    }

    // 빌링키 지우기 규칙: 그 자리에서 포트원을 부르지 않고 목록에 넣는다(openapi startSubscription).
    void queueKeyDeletion(String billingKey) {
        jdbc.sql("insert into billing_key_deletions (billing_key) values (:key)").param("key", billingKey).update();
    }

    // 탈퇴. 고객 ID가 없으면(구독 화면을 연 적 없음) 카드를 등록한 적도 없으므로 넣지 않는다.
    void queueCustomerDeletion(long userId) {
        jdbc.sql("insert into billing_key_deletions (customer_id, customer_since)"
                + " select customer_id, customer_id_created_at from users where id = :id and customer_id is not null")
                .param("id", userId).update();
    }

    List<Deletion> findDeletions(int limit) {
        return jdbc.sql("select id, billing_key, customer_id, customer_since from billing_key_deletions order by id limit :limit")
                .param("limit", limit)
                .query((rs, n) -> new Deletion(rs.getLong("id"), rs.getString("billing_key"), rs.getString("customer_id"),
                        instant(rs, "customer_since")))
                .list();
    }

    void removeDeletion(long id) {
        jdbc.sql("delete from billing_key_deletions where id = :id").param("id", id).update();
    }

    // 기간이 끝났고 결과 모름 결제가 없는 진행 중 구독(갱신 대상).
    List<Long> findDueRenewals(int limit) {
        return jdbc.sql("select s.user_id from subscriptions s where s.status = 'ACTIVE' and s.current_period_end <= now()"
                + " and not exists (select 1 from payments p where p.user_id = s.user_id and p.status = 'PENDING')"
                + " order by s.current_period_end limit :limit")
                .param("limit", limit).query(Long.class).list();
    }

    // 기간이 끝났고 결과 모름 결제가 없는 해지 예정 구독(NONE으로 정리할 대상).
    List<Long> findEndedCancellations(int limit) {
        return jdbc.sql("select s.user_id from subscriptions s where s.status = 'CANCEL_SCHEDULED'"
                + " and s.current_period_end <= now()"
                + " and not exists (select 1 from payments p where p.user_id = s.user_id and p.status = 'PENDING')"
                + " order by s.current_period_end limit :limit")
                .param("limit", limit).query(Long.class).list();
    }

    // 만든 지 olderThanSeconds가 지난 결과 모름 결제(막 보낸 결제와 겹치지 않게 조금 기다린다).
    List<String> findStalePending(long olderThanSeconds, int limit) {
        return jdbc.sql("select payment_id from payments where status = 'PENDING'"
                + " and created_at <= now() - make_interval(secs => :secs) order by created_at limit :limit")
                .param("secs", olderThanSeconds).param("limit", limit).query(String.class).list();
    }

    // 1시간 넘게 결과를 모르는 결제를 '확인 필요'로 표시한다. 결과가 확정되면 updatePayment가 표시를 푼다.
    int flagLongPending() {
        return jdbc.sql("update payments set needs_cancel = true where status = 'PENDING' and not needs_cancel"
                + " and created_at <= now() - interval '1 hour'").update();
    }

    private static Sub sub(ResultSet rs) throws SQLException {
        String next = rs.getString("next_cycle");
        return new Sub(rs.getLong("user_id"), Status.valueOf(rs.getString("status")), Cycle.valueOf(rs.getString("cycle")),
                next == null ? null : Cycle.valueOf(next), rs.getString("billing_key"), instant(rs, "anchor_at"),
                rs.getInt("months"), instant(rs, "current_period_end"), rs.getString("last_applied_payment_id"));
    }

    private static Payment payment(ResultSet rs) throws SQLException {
        return new Payment(rs.getString("payment_id"), rs.getLong("user_id"), Kind.valueOf(rs.getString("kind")),
                Cycle.valueOf(rs.getString("cycle")), rs.getInt("amount"), rs.getString("billing_key"),
                PayStatus.valueOf(rs.getString("status")), rs.getBoolean("needs_cancel"), instant(rs, "paid_at"),
                instant(rs, "created_at"));
    }

    private static Instant instant(ResultSet rs, String column) throws SQLException {
        OffsetDateTime time = rs.getObject(column, OffsetDateTime.class);
        return time == null ? null : time.toInstant();
    }

    private static OffsetDateTime utc(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
