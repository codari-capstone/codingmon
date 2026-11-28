package com.codingmon.api.submission;

import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

// 문제별 풀이 통계(user_problem_stats). 문제 목록의 풀이 상태(LIST-01)와 취약 개념·추천이 이 값을 쓴다.
@Repository
public class UserProblemStatsRepository {

    private final JdbcClient jdbc;

    UserProblemStatsRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    // recordJudged가 만들거나 고친 행. 배지(#248)가 그 문제를 처음 맞힌 제출인지와 시도 횟수·힌트 단계를 본다.
    public record Judged(long problemId, boolean solved, int attemptCount, int maxRevealedHintLevel) {
    }

    // 채점 처리기(#71)가 SUBMIT 제출을 COMPLETED로 바꾸는 트랜잭션 안에서 제출마다 한 번 부른다.
    // 두 번 부르면 시도 횟수가 두 번 올라가므로, COMPLETED로 바뀐 그 갱신에서만 부른다.
    // 정답 이후 제출은 세지 않는다(database-tables.md). SAMPLE_RUN·VALIDATION·채점 불가·채점 중이면 아무것도 하지 않는다.
    // 만들거나 고친 행을 돌려준다. 이미 맞힌 문제거나 아무것도 하지 않았으면 비어 있다.
    // 그래서 돌려받은 행의 solved가 참이면 이 제출이 그 문제를 처음 맞힌 제출이다.
    // ponytail: 판정이 확정된 순서대로 센다. 슬롯 2개에서 늦게 낸 정답이 먼저 끝나면 먼저 낸 오답은 정답 뒤로 보고 세지 않는다.
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<Judged> recordJudged(long submissionId) {
        return jdbc.sql("insert into user_problem_stats (user_id, problem_id, solved, first_solved_at, attempt_count)"
                + " select s.user_id, v.problem_id, s.verdict = 'ACCEPTED',"
                + "   case when s.verdict = 'ACCEPTED' then coalesce(s.judged_at, now()) end, 1"
                + " from submissions s join problem_versions v on v.id = s.problem_version_id"
                + " where s.id = :id and s.submission_kind = 'SUBMIT' and s.job_status = 'COMPLETED'"
                + " on conflict (user_id, problem_id) do update set"
                + "   solved = excluded.solved, first_solved_at = excluded.first_solved_at,"
                + "   attempt_count = user_problem_stats.attempt_count + 1, updated_at = now()"
                + " where not user_problem_stats.solved"
                + " returning problem_id, solved, attempt_count, max_revealed_hint_level")
                .param("id", submissionId)
                .query((rs, n) -> new Judged(rs.getLong("problem_id"), rs.getBoolean("solved"),
                        rs.getInt("attempt_count"), rs.getInt("max_revealed_hint_level")))
                .optional();
    }

    // 제출의 AI 분석에서 힌트를 level 단계까지 열었다(#77). 아직 못 푼 문제면 가장 높은 단계를 올린다.
    // 정답 이후에 연 힌트는 세지 않는다(database-tables.md). 판정이 난 제출이라 행은 이미 있다.
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordHintRevealed(long submissionId, int level) {
        jdbc.sql("update user_problem_stats st set"
                + "   max_revealed_hint_level = :level, updated_at = now()"
                + " from submissions s join problem_versions v on v.id = s.problem_version_id"
                + " where s.id = :id and st.user_id = s.user_id and st.problem_id = v.problem_id"
                + "   and not st.solved and st.max_revealed_hint_level < :level")
                .param("level", level)
                .param("id", submissionId)
                .update();
    }
}
