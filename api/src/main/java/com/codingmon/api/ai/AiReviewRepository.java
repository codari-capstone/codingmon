package com.codingmon.api.ai;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Collection;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

// ai_reviews. 한 제출·기능·프롬프트 버전에 행이 하나다(유일 제약). 재시도는 새 행을 만들지 않고 같은 행을 PENDING으로 되돌린다
// (database-schema.md). 시도마다 created_at이 바뀌므로 결과는 그 시도의 created_at이 그대로일 때만 저장한다.
// 그래서 다시 시작한 요청의 이전 시도가 늦게 끝나도 새 시도를 덮어쓰지 못한다.
@Repository
class AiReviewRepository {

    enum Status { PENDING, COMPLETED, FAILED }

    // 시도 하나. attempt는 그 시도를 시작한 created_at이다.
    record Claim(long id, OffsetDateTime attempt) {
    }

    // content는 COMPLETED일 때만 있다. status는 버려진 PENDING(Abandoned)을 FAILED로 바꿔 읽은 값이다.
    record Stored(long id, long submissionId, Status status, String content, int revealedHintLevel,
            Instant createdAt, Instant completedAt) {
    }

    // 분석할 수 있는지 볼 제출 정보. 본인의 SUBMIT 제출만 찾는다.
    record Target(String jobStatus, String verdict) {
    }

    // 끝나지 않은 PENDING 중 버려진 것을 가리는 기준. 이 서버의 처리기에 남아 있는(active) 시도는 오래 걸려도 버려진 것이 아니다.
    // 그 밖의 PENDING(서버가 처리 중에 내려갔다)은 시작하고 timeout이 지나면 버려진 것으로 본다. 시각은 DB 시계로만 비교한다.
    record Abandoned(Duration timeout, Collection<Long> active) {

        private static final String CONDITION = "r.status = 'PENDING'"
                + " and r.created_at < now() - make_interval(secs => :timeoutSeconds)"
                + " and r.id <> all(cast(:active as bigint[]))";

        String condition(String alias) {
            return CONDITION.replace("r.", alias + ".");
        }

        // 배열을 그대로 넘기면 NamedParameterJdbcTemplate이 IN 목록처럼 펼치므로 PostgreSQL 배열 글자로 넘긴다.
        String activeArray() {
            return active.stream().map(String::valueOf).collect(Collectors.joining(",", "{", "}"));
        }

        JdbcClient.StatementSpec bind(JdbcClient.StatementSpec spec) {
            return spec.param("timeoutSeconds", timeout.toSeconds()).param("active", activeArray());
        }
    }

    private static final String STORED_COLUMNS = "r.id, r.submission_id, r.prompt_version,"
            + " case when %s then 'FAILED' else r.status end as status,"
            + " r.content::text as content, r.revealed_hint_level, r.created_at, r.completed_at,"
            + " coalesce((r.content ->> 'blocked')::boolean, false) as blocked";

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

    // 행이 없으면 만들고, FAILED이거나 버려진 PENDING이면 PENDING으로 되돌린다.
    // 한 문장이라 동시에 눌러도 한 요청만 시도를 얻는다. 끝났거나(차단 포함) 진행 중이면 비어 있다.
    // 토큰 수는 그대로 둔다(addUsage가 시도마다 더한다).
    Optional<Claim> claim(long submissionId, ReviewType type, String promptVersion, String model, Abandoned abandoned) {
        return abandoned.bind(jdbc.sql("insert into ai_reviews as r (submission_id, review_type, prompt_version, model)"
                + " values (:submissionId, :type, :promptVersion, :model)"
                + " on conflict (submission_id, review_type, prompt_version) do update set"
                + "   status = 'PENDING', model = excluded.model, content = null, revealed_hint_level = 0,"
                + "   created_at = now(), completed_at = null"
                + " where r.status = 'FAILED' or (" + abandoned.condition("r") + ")"
                + " returning id, created_at"))
                .param("submissionId", submissionId)
                .param("type", type.name())
                .param("promptVersion", promptVersion)
                .param("model", model)
                .query((rs, n) -> new Claim(rs.getLong("id"), rs.getObject("created_at", OffsetDateTime.class)))
                .optional();
    }

    // 본인 제출에서 화면에 보여 줄 결과 하나(contracts의 GET /api/submissions/{id}/analysis). 요청·조회·힌트 열기가 모두 이것을 본다.
    // 지금 버전의 결과가 FAILED도 차단도 아니면 그것, 아니면 이전 버전의 차단되지 않은 끝난 결과 중 마지막 것,
    // 그다음 지금 버전의 결과(FAILED·차단), 그다음 마지막 행. 새 버전이 실패하거나 차단돼도 이미 본 분석과 연 힌트가 가려지지 않고,
    // 차단된 이전 결과가 지금 버전의 FAILED(다시 요청할 수 있다)를 가리지도 않는다.
    Optional<Stored> findShown(long userId, long submissionId, ReviewType type, String promptVersion,
            Abandoned abandoned) {
        return abandoned.bind(jdbc.sql("select * from (select " + STORED_COLUMNS.formatted(abandoned.condition("r"))
                + "   from ai_reviews r join submissions s on s.id = r.submission_id"
                + "   where r.submission_id = :submissionId and s.user_id = :userId and r.review_type = :type) x"
                + " order by case when x.prompt_version = :promptVersion and x.status <> 'FAILED' and not x.blocked then 0"
                + "   when x.status = 'COMPLETED' and not x.blocked then 1 when x.prompt_version = :promptVersion then 2"
                + "   else 3 end,"
                + " x.id desc limit 1"))
                .param("submissionId", submissionId)
                .param("userId", userId)
                .param("type", type.name())
                .param("promptVersion", promptVersion)
                .query(AiReviewRepository::stored)
                .optional();
    }

    // 힌트를 여는 동안 다른 요청이 같은 행을 바꾸지 못하게 잠그고 다시 읽는다(트랜잭션 안에서 부른다).
    Stored lock(long reviewId, Abandoned abandoned) {
        return abandoned.bind(jdbc.sql("select " + STORED_COLUMNS.formatted(abandoned.condition("r"))
                + " from ai_reviews r where r.id = :id for update"))
                .param("id", reviewId)
                .query(AiReviewRepository::stored)
                .single();
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
}
