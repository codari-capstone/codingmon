package com.codingmon.api.ai;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import com.codingmon.api.ai.AiReviewRepository.Abandoned;
import com.codingmon.api.ai.AiReviewRepository.Claim;
import com.codingmon.api.ai.AiReviewRepository.FailureReason;
import com.codingmon.api.ai.AiReviewRepository.Status;
import com.codingmon.api.learning.RecommendationRepository.Recommendation;

// learning_reports와 learning_report_recommendations(#85). 사용자마다 하루(UTC 날짜)에 리포트 행이 하나다(유일 제약).
// 재시도는 ai_reviews처럼 새 행을 만들지 않고 같은 행을 PENDING으로 되돌린다(database-schema.md). 시도마다 generated_at이 바뀌므로
// 결과는 그 시도의 generated_at이 그대로일 때만 저장한다. 그래서 다시 시작한 요청의 이전 시도가 늦게 끝나도 새 시도를 덮어쓰지 못한다.
// 하루와 시각은 DB 시계로만 잰다.
@Repository
class LearningReportRepository {

    // statistics는 만들 때의 통계 JSON(LearningStats), content는 COMPLETED일 때만 있는 문장 JSON(LearningReportContent)이다.
    // status·failureReason은 버려진 PENDING을 FAILED(UNAVAILABLE)로 바꿔 읽은 값이다(AiReviewRepository.Stored와 같다).
    record Stored(long id, LocalDate reportDate, Status status, FailureReason failureReason, String statistics,
            String content, Instant generatedAt) {
    }

    // 모델에 보낼 추천 문제 하나(LearningReportInput.Recommendation). concept는 근거 태그 이름이고 도전 문제면 null이다.
    // attempted는 냈지만 아직 맞히지 못한 문제다(추천 후보는 아직 맞히지 않은 문제뿐이다).
    record RecommendedProblem(int rank, String title, String difficulty, String concept, boolean attempted) {
    }

    // 화면에 보여 줄 추천 문제 하나. conceptSlug·conceptName은 도전 문제면 null이다. solveStatus는 지금의 풀이 상태다.
    record ShownRecommendation(int rank, long problemId, String title, String difficulty, String conceptSlug,
            String conceptName, String solveStatus) {
    }

    private static final String TODAY = "(now() at time zone 'UTC')::date";

    // %1$s는 버려진 PENDING 조건(Abandoned.condition)이다.
    private static final String STORED_COLUMNS = "r.id, r.report_date,"
            + " case when %1$s then 'FAILED' else r.status end as status,"
            + " case when %1$s then 'UNAVAILABLE' else r.failure_reason end as failure_reason,"
            + " r.statistics::text as statistics, r.content::text as content, r.generated_at";

    // 문제의 지금 공개 버전, 공개가 내려갔으면 마지막으로 공개됐던 버전. 추천한 문제는 그때 공개 중이었으므로 늘 하나가 있다.
    private static final String SHOWN_VERSION = "select v.title, v.difficulty from problem_versions v"
            + " where v.problem_id = %s and v.published_at is not null"
            + " order by (v.status = 'PUBLISHED') desc, v.published_at desc limit 1";

    private final JdbcClient jdbc;

    LearningReportRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // 오늘(UTC) 리포트
    Optional<Stored> findToday(long userId, Abandoned abandoned) {
        return abandoned.bind(jdbc.sql("select " + columns(abandoned) + " from learning_reports r"
                + " where r.user_id = :userId and r.report_date = " + TODAY))
                .param("userId", userId)
                .query(LearningReportRepository::stored)
                .optional();
    }

    // 가장 최근 날짜의 리포트. 오늘 것이 없으면 지난 날짜의 것이다.
    Optional<Stored> findLatest(long userId, Abandoned abandoned) {
        return abandoned.bind(jdbc.sql("select " + columns(abandoned) + " from learning_reports r"
                + " where r.user_id = :userId order by r.report_date desc limit 1"))
                .param("userId", userId)
                .query(LearningReportRepository::stored)
                .optional();
    }

    // 오늘 행이 없으면 만들고, FAILED이거나 버려진 PENDING이면 PENDING으로 되돌려 통계를 지금 것으로 덮어쓴다.
    // 한 문장이라 동시에 눌러도 한 요청만 시도를 얻는다. 끝났거나 진행 중이면 비어 있다. 토큰 수는 그대로 둔다(addUsage가 시도마다 더한다).
    Optional<Claim> claim(long userId, String statistics, String promptVersion, String model, Abandoned abandoned) {
        return abandoned.bind(jdbc.sql("insert into learning_reports as r"
                + " (user_id, report_date, statistics, prompt_version, model)"
                + " values (:userId, " + TODAY + ", cast(:statistics as jsonb), :promptVersion, :model)"
                + " on conflict (user_id, report_date) do update set"
                + "   status = 'PENDING', failure_reason = null, statistics = excluded.statistics, content = null,"
                + "   prompt_version = excluded.prompt_version, model = excluded.model, generated_at = now()"
                + " where r.status = 'FAILED' or (" + abandoned.condition("r", "generated_at") + ")"
                + " returning id, generated_at"))
                .param("userId", userId)
                .param("statistics", statistics)
                .param("promptVersion", promptVersion)
                .param("model", model)
                .query((rs, n) -> new Claim(rs.getLong("id"), rs.getObject("generated_at", OffsetDateTime.class)))
                .optional();
    }

    // 다시 시도하면 추천도 그 시점 기준으로 다시 계산해 덮어쓴다. claim과 한 트랜잭션에서 부른다.
    void replaceRecommendations(long reportId, List<Recommendation> recommendations) {
        jdbc.sql("delete from learning_report_recommendations where learning_report_id = :id").param("id", reportId)
                .update();
        for (Recommendation r : recommendations) {
            jdbc.sql("insert into learning_report_recommendations (learning_report_id, rank, problem_id, concept_tag_id)"
                    + " values (:id, :rank, :problemId, :tagId)")
                    .param("id", reportId)
                    .param("rank", r.rank())
                    .param("problemId", r.problemId())
                    .param("tagId", r.conceptTagId())
                    .update();
        }
    }

    // 모델에 보낼 추천 문제(순위 순). 추천은 많아야 3개라 하나씩 읽는다.
    List<RecommendedProblem> findRecommended(long userId, List<Recommendation> recommendations) {
        return recommendations.stream().map(r -> jdbc.sql("select v.title, v.difficulty,"
                + " (select c.name from concept_tags c where c.id = :tagId) as concept,"
                + " exists (select 1 from user_problem_stats s where s.user_id = :userId and s.problem_id = :problemId)"
                + "   as attempted"
                + " from (" + SHOWN_VERSION.formatted(":problemId") + ") v")
                .param("tagId", r.conceptTagId())
                .param("userId", userId)
                .param("problemId", r.problemId())
                .query((rs, n) -> new RecommendedProblem(r.rank(), rs.getString("title"), rs.getString("difficulty"),
                        rs.getString("concept"), rs.getBoolean("attempted")))
                .single())
                .toList();
    }

    // 화면에 보여 줄 추천 문제(순위 순). 풀이 상태는 문제 목록(LIST-01)과 같은 규칙으로 지금 기준이다.
    List<ShownRecommendation> findRecommendations(long userId, long reportId) {
        return jdbc.sql("select r.rank, r.problem_id, v.title, v.difficulty, c.slug, c.name,"
                + " case when s.solved then 'SOLVED' when s.problem_id is not null then 'WRONG' else 'UNSOLVED' end"
                + "   as solve_status"
                + " from learning_report_recommendations r"
                + " join lateral (" + SHOWN_VERSION.formatted("r.problem_id") + ") v on true"
                + " left join concept_tags c on c.id = r.concept_tag_id"
                + " left join user_problem_stats s on s.user_id = :userId and s.problem_id = r.problem_id"
                + " where r.learning_report_id = :id order by r.rank")
                .param("userId", userId)
                .param("id", reportId)
                .query((rs, n) -> new ShownRecommendation(rs.getInt("rank"), rs.getLong("problem_id"),
                        rs.getString("title"), rs.getString("difficulty"), rs.getString("slug"), rs.getString("name"),
                        rs.getString("solve_status")))
                .list();
    }

    // 그 시도가 아직 진행 중일 때만 저장한다. 저장했으면 true다.
    boolean complete(Claim claim, String content) {
        return jdbc.sql("update learning_reports set status = 'COMPLETED', content = cast(:content as jsonb)"
                + " where id = :id and status = 'PENDING' and generated_at = :attempt")
                .param("content", content)
                .param("id", claim.id())
                .param("attempt", claim.attempt())
                .update() == 1;
    }

    // 그 시도가 아직 진행 중일 때만 실패로 바꾼다. 바꿨으면 true다.
    boolean fail(Claim claim, FailureReason reason) {
        return jdbc.sql("update learning_reports set status = 'FAILED', failure_reason = :reason"
                + " where id = :id and status = 'PENDING' and generated_at = :attempt")
                .param("reason", reason.name())
                .param("id", claim.id())
                .param("attempt", claim.attempt())
                .update() == 1;
    }

    // 실패한 시도의 토큰도 지우지 않고 다시 시도한 호출의 토큰을 더한다.
    void addUsage(long reportId, LlmUsage usage) {
        jdbc.sql("""
                update learning_reports
                set input_tokens = coalesce(input_tokens, 0) + :input,
                    output_tokens = coalesce(output_tokens, 0) + :output
                where id = :id
                """)
                .param("input", usage.inputTokens())
                .param("output", usage.outputTokens())
                .param("id", reportId)
                .update();
    }

    private static String columns(Abandoned abandoned) {
        return STORED_COLUMNS.formatted(abandoned.condition("r", "generated_at"));
    }

    private static Stored stored(ResultSet rs, int n) throws SQLException {
        String failureReason = rs.getString("failure_reason");
        return new Stored(rs.getLong("id"), rs.getObject("report_date", LocalDate.class),
                Status.valueOf(rs.getString("status")),
                failureReason == null ? null : FailureReason.valueOf(failureReason), rs.getString("statistics"),
                rs.getString("content"), rs.getObject("generated_at", OffsetDateTime.class).toInstant());
    }
}
