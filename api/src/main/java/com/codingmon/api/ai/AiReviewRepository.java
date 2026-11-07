package com.codingmon.api.ai;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// ai_reviews. 한 제출·기능·프롬프트 버전에 행이 하나다(유일 제약). 재시도는 새 행을 만들지 않고 같은 행을 PENDING으로 되돌린다
// (database-schema.md). 시도마다 created_at이 바뀌므로 결과는 그 시도의 created_at이 그대로일 때만 저장한다.
// 그래서 오래 걸려 다시 시작한 요청의 이전 시도가 늦게 끝나도 새 시도를 덮어쓰지 못한다.
@Repository
class AiReviewRepository {

    enum Status { PENDING, COMPLETED, FAILED }

    // 시도 하나. attempt는 그 시도를 시작한 created_at이다.
    record Claim(long id, OffsetDateTime attempt) {
    }

    // content는 COMPLETED일 때만 있다. status는 staleBefore 전에 시작해 끝나지 않은 PENDING을 FAILED로 바꿔 읽은 값이다.
    record Stored(long id, long submissionId, Status status, String content, int revealedHintLevel,
            Instant createdAt, Instant completedAt) {
    }

    // 분석할 수 있는지 볼 제출 정보. 본인의 SUBMIT 제출만 찾는다.
    record Target(String jobStatus, String verdict) {
    }

    private static final String STORED_COLUMNS = "r.id, r.submission_id,"
            + " case when r.status = 'PENDING' and r.created_at < :staleBefore then 'FAILED' else r.status end as status,"
            + " r.content::text as content, r.revealed_hint_level, r.created_at, r.completed_at";

    private final JdbcClient jdbc;

    AiReviewRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    Optional<Target> findTarget(long userId, long submissionId) {
        return jdbc.sql("select job_status, verdict from submissions"
                + " where id = :id and user_id = :userId and submission_kind = 'SUBMIT'")
                .param("id", submissionId)
                .param("userId", userId)
                .query((rs, n) -> new Target(rs.getString("job_status"), rs.getString("verdict")))
                .optional();
    }

    // 행이 없으면 만들고, FAILED이거나 staleBefore 전에 시작해 끝나지 않은 PENDING이면 PENDING으로 되돌린다.
    // 한 문장이라 동시에 눌러도 한 요청만 시도를 얻는다. 이미 끝났거나 진행 중이면 비어 있다.
    // 토큰 수는 그대로 둔다(addUsage가 시도마다 더한다).
    Optional<Claim> claim(long submissionId, ReviewType type, String promptVersion, String model, Instant staleBefore) {
        return jdbc.sql("insert into ai_reviews (submission_id, review_type, prompt_version, model)"
                + " values (:submissionId, :type, :promptVersion, :model)"
                + " on conflict (submission_id, review_type, prompt_version) do update set"
                + "   status = 'PENDING', model = excluded.model, content = null, revealed_hint_level = 0,"
                + "   created_at = now(), completed_at = null"
                + " where ai_reviews.status = 'FAILED'"
                + "   or (ai_reviews.status = 'PENDING' and ai_reviews.created_at < :staleBefore)"
                + " returning id, created_at")
                .param("submissionId", submissionId)
                .param("type", type.name())
                .param("promptVersion", promptVersion)
                .param("model", model)
                .param("staleBefore", utc(staleBefore))
                .query((rs, n) -> new Claim(rs.getLong("id"), rs.getObject("created_at", OffsetDateTime.class)))
                .optional();
    }

    Optional<Stored> find(long submissionId, ReviewType type, String promptVersion, Instant staleBefore) {
        return jdbc.sql("select " + STORED_COLUMNS + " from ai_reviews r"
                + " where r.submission_id = :submissionId and r.review_type = :type and r.prompt_version = :promptVersion")
                .param("submissionId", submissionId)
                .param("type", type.name())
                .param("promptVersion", promptVersion)
                .param("staleBefore", utc(staleBefore))
                .query(AiReviewRepository::stored)
                .optional();
    }

    // 본인 제출의 마지막 결과. 프롬프트 버전이 바뀌면 행이 여럿일 수 있다.
    // lock이면 힌트를 여는 동안 다른 요청이 같은 행을 바꾸지 못하게 잠근다(트랜잭션 안에서 부른다).
    Optional<Stored> findLatest(long userId, long submissionId, ReviewType type, Instant staleBefore, boolean lock) {
        return jdbc.sql("select " + STORED_COLUMNS + " from ai_reviews r join submissions s on s.id = r.submission_id"
                + " where r.submission_id = :submissionId and s.user_id = :userId and r.review_type = :type"
                + " order by r.id desc limit 1" + (lock ? " for update of r" : ""))
                .param("submissionId", submissionId)
                .param("userId", userId)
                .param("type", type.name())
                .param("staleBefore", utc(staleBefore))
                .query(AiReviewRepository::stored)
                .optional();
    }

    // 그 시도가 아직 진행 중일 때만 저장한다. 저장했으면 true다.
    boolean complete(Claim claim, String json) {
        return jdbc.sql("update ai_reviews set status = 'COMPLETED', content = cast(:json as jsonb), completed_at = now()"
                + " where id = :id and status = 'PENDING' and created_at = :attempt")
                .param("json", json)
                .param("id", claim.id())
                .param("attempt", claim.attempt())
                .update() == 1;
    }

    boolean fail(Claim claim) {
        return jdbc.sql("update ai_reviews set status = 'FAILED', completed_at = now()"
                + " where id = :id and status = 'PENDING' and created_at = :attempt")
                .param("id", claim.id())
                .param("attempt", claim.attempt())
                .update() == 1;
    }

    void revealHint(long reviewId, int level) {
        jdbc.sql("update ai_reviews set revealed_hint_level = :level where id = :id")
                .param("level", level)
                .param("id", reviewId)
                .update();
    }

    // 실패한 행을 다시 시도해도 앞서 쓴 토큰이 사라지지 않게 더한다.
    void addUsage(long reviewId, LlmUsage usage) {
        jdbc.sql("""
                update ai_reviews
                set input_tokens = coalesce(input_tokens, 0) + :input,
                    output_tokens = coalesce(output_tokens, 0) + :output
                where id = :id
                """)
                .param("input", usage.inputTokens())
                .param("output", usage.outputTokens())
                .param("id", reviewId)
                .update();
    }

    private static Stored stored(ResultSet rs, int n) throws SQLException {
        OffsetDateTime completedAt = rs.getObject("completed_at", OffsetDateTime.class);
        return new Stored(rs.getLong("id"), rs.getLong("submission_id"), Status.valueOf(rs.getString("status")),
                rs.getString("content"), rs.getInt("revealed_hint_level"),
                rs.getObject("created_at", OffsetDateTime.class).toInstant(),
                completedAt == null ? null : completedAt.toInstant());
    }

    private static OffsetDateTime utc(Instant instant) {
        return OffsetDateTime.ofInstant(instant, ZoneOffset.UTC);
    }
}
