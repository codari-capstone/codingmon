package com.codingmon.api.submission;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.Language;
import com.codingmon.api.Page;

// 관리자 회원 상세의 제출 목록과 맞힌 문제(ADM-15, #227). 학습자 제출 기록(SubmissionRepository)과 같은 기준으로 센다.
@Repository
class AdminSubmissionRepository {

    record UserSubmission(long id, long problemId, String problemTitle, Language language, String status, String verdict,
            Instant submittedAt) {
    }

    record SolvedProblem(long problemId, String title, Instant firstSolvedAt, int attemptCount) {
    }

    // 문제와 상관없이 채점이 끝난 SUBMIT만 센다. 예제 실행·관리자 검증은 빠진다(GET /api/submissions와 같다).
    private static final String FINISHED = " from submissions s join problem_versions v on v.id = s.problem_version_id"
            + " where s.user_id = :userId and s.submission_kind = 'SUBMIT' and s.job_status in ('COMPLETED', 'JUDGE_ERROR')";

    private final JdbcClient jdbc;

    AdminSubmissionRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    boolean userExists(long userId) {
        return jdbc.sql("select exists (select 1 from users where id = :id)").param("id", userId).query(Boolean.class).single();
    }

    // count와 목록이 같은 시점을 보게 묶는다.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    Page<UserSubmission> findSubmissions(long userId, int page, int size) {
        long total = jdbc.sql("select count(*)" + FINISHED).param("userId", userId).query(Long.class).single();
        List<UserSubmission> content = jdbc.sql("select s.id, v.problem_id, v.title, s.language, s.job_status, s.verdict,"
                + " s.submitted_at" + FINISHED + " order by s.submitted_at desc, s.id desc limit :limit offset :offset")
                .param("userId", userId)
                .param("limit", size)
                .param("offset", (long) page * size)
                .query((rs, n) -> new UserSubmission(rs.getLong("id"), rs.getLong("problem_id"), rs.getString("title"),
                        Language.valueOf(rs.getString("language")), rs.getString("job_status"), rs.getString("verdict"),
                        rs.getObject("submitted_at", OffsetDateTime.class).toInstant()))
                .list();
        return new Page<>(content, total);
    }

    // 맞힌 문제는 많아야 문제 수만큼이라 모두 준다. 제목은 최신 버전의 제목이다(관리자 문제 목록과 같다).
    List<SolvedProblem> findSolvedProblems(long userId) {
        return jdbc.sql("select st.problem_id, st.first_solved_at, st.attempt_count,"
                + " (select title from problem_versions where problem_id = st.problem_id order by version_no desc limit 1) as title"
                + " from user_problem_stats st where st.user_id = :userId and st.solved"
                + " order by st.first_solved_at desc, st.problem_id desc")
                .param("userId", userId)
                .query((rs, n) -> new SolvedProblem(rs.getLong("problem_id"), rs.getString("title"),
                        rs.getObject("first_solved_at", OffsetDateTime.class).toInstant(), rs.getInt("attempt_count")))
                .list();
    }
}
