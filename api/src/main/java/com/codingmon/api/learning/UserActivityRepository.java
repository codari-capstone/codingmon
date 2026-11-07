package com.codingmon.api.learning;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

// MY-05 풀이 요약과 잔디. 맞힌·틀린 수는 판정이 난 제출만 쌓이는 user_problem_stats로,
// 잔디는 판정과 관계없이 사용자 제출(SUBMIT)로 센다.
@Repository
class UserActivityRepository {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final int DAYS_BEFORE_TODAY = 364;

    private final JdbcClient jdbc;

    UserActivityRepository(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    record UserActivity(int solvedCount, int wrongCount, SolvedByDifficulty solvedByDifficulty, LocalDate from,
            LocalDate to, List<ActivityDay> days, int totalActiveDays) {
    }

    // 필드 이름이 그대로 응답의 키가 된다(openapi.yaml의 Difficulty).
    record SolvedByDifficulty(int EASY, int MEDIUM, int HARD) {
    }

    record ActivityDay(LocalDate date, int count) {
    }

    private record Summary(int solved, int wrong, SolvedByDifficulty byDifficulty) {
    }

    // 요약과 잔디가 같은 시점을 보게 묶는다.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    UserActivity find(long userId) {
        LocalDate to = LocalDate.now(KST);
        LocalDate from = to.minusDays(DAYS_BEFORE_TODAY);
        // 공개가 내려간 문제는 마지막으로 공개됐던 버전의 난이도로 센다.
        Summary summary = jdbc.sql("""
                select count(*) filter (where s.solved) as solved,
                       count(*) filter (where not s.solved) as wrong,
                       count(*) filter (where s.solved and v.difficulty = 'EASY') as easy,
                       count(*) filter (where s.solved and v.difficulty = 'MEDIUM') as medium,
                       count(*) filter (where s.solved and v.difficulty = 'HARD') as hard
                from user_problem_stats s
                left join lateral (
                  select difficulty from problem_versions
                  where problem_id = s.problem_id and published_at is not null
                  order by published_at desc limit 1
                ) v on true
                where s.user_id = :userId
                """)
                .param("userId", userId)
                .query((rs, n) -> new Summary(rs.getInt("solved"), rs.getInt("wrong"),
                        new SolvedByDifficulty(rs.getInt("easy"), rs.getInt("medium"), rs.getInt("hard"))))
                .single();
        List<ActivityDay> days = jdbc.sql("""
                select (submitted_at at time zone 'Asia/Seoul')::date as day, count(*) as count
                from submissions
                where user_id = :userId and submission_kind = 'SUBMIT'
                  and submitted_at >= :start and submitted_at < :end
                group by day
                order by day
                """)
                .param("userId", userId)
                .param("start", startOf(from))
                .param("end", startOf(to.plusDays(1)))
                .query((rs, n) -> new ActivityDay(rs.getObject("day", LocalDate.class), rs.getInt("count")))
                .list();
        return new UserActivity(summary.solved(), summary.wrong(), summary.byDifficulty(), from, to, days, days.size());
    }

    private static OffsetDateTime startOf(LocalDate date) {
        return date.atStartOfDay(KST).toOffsetDateTime();
    }
}
