package com.codingmon.api.learning;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

// MY-05 풀이 요약과 잔디, STREAK-01·02 연속 학습. 맞힌·틀린 수는 판정이 난 제출만 쌓이는 user_problem_stats로,
// 잔디와 연속 학습은 판정과 관계없이 사용자 제출(SUBMIT)로 센다.
// recordSubmission을 제출 API(SubmissionController)가 불러서 public이다.
@Repository
public class UserActivityRepository {

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

    record UserStreak(int currentStreak, boolean activeToday, LocalDate today, List<StreakDay> week) {
    }

    record StreakDay(LocalDate date, boolean active) {
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

    // 사용자 제출을 저장한 트랜잭션 안에서 부른다. 저장이 실패하면 연속 일수도 바뀌지 않는다.
    // 한 문장으로 갱신해 같은 순간에 두 번 제출해도 두 번 더하지 않는다.
    // 오늘은 DB 시계로 정한다. now()는 트랜잭션 시작 시각이라 방금 저장한 submitted_at과 같은 날이 된다.
    public void recordSubmission(long userId) {
        jdbc.sql("""
                update users set
                  streak_days = case
                    when last_active_date = t.today then streak_days
                    when last_active_date = t.today - 1 then streak_days + 1
                    else 1 end,
                  last_active_date = t.today
                from (select (now() at time zone 'Asia/Seoul')::date as today) t
                where id = :userId
                """)
                .param("userId", userId)
                .update();
    }

    // 연속 일수와 이번 주 달력이 같은 시점을 보게 묶는다.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    UserStreak findStreak(long userId) {
        record Row(int streakDays, LocalDate lastActiveDate, LocalDate today) {
        }
        Row row = jdbc.sql("""
                select streak_days, last_active_date, (now() at time zone 'Asia/Seoul')::date as today
                from users where id = :userId
                """)
                .param("userId", userId)
                .query((rs, n) -> new Row(rs.getInt("streak_days"), rs.getObject("last_active_date", LocalDate.class),
                        rs.getObject("today", LocalDate.class)))
                .single();
        LocalDate today = row.today();
        LocalDate last = row.lastActiveDate();
        boolean activeToday = today.equals(last);
        // 어제까지 이어졌으면 오늘 아직 제출하지 않았어도 유지한다. 그보다 전이면 끊긴 것이다.
        int current = activeToday || today.minusDays(1).equals(last) ? row.streakDays() : 0;

        LocalDate monday = today.with(DayOfWeek.MONDAY);
        Set<LocalDate> active = new HashSet<>(jdbc.sql("""
                select distinct (submitted_at at time zone 'Asia/Seoul')::date as day
                from submissions
                where user_id = :userId and submission_kind = 'SUBMIT'
                  and submitted_at >= :start and submitted_at < :end
                """)
                .param("userId", userId)
                .param("start", startOf(monday))
                .param("end", startOf(monday.plusDays(7)))
                .query(LocalDate.class)
                .list());
        List<StreakDay> week = monday.datesUntil(monday.plusDays(7))
                .map(d -> new StreakDay(d, active.contains(d)))
                .toList();
        return new UserStreak(current, activeToday, today, week);
    }

    private static OffsetDateTime startOf(LocalDate date) {
        return date.atStartOfDay(KST).toOffsetDateTime();
    }
}
