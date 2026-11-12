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

    // 사용자 제출을 저장하기 전에 부른다. 같은 사용자의 제출을 한 줄로 세워, 먼저 잠근 제출이 먼저 제출 시각을 받고
    // 먼저 연속 일수를 갱신하게 한다. 제출 시각(submitted_at)은 잠근 뒤의 clock_timestamp()라 날짜 순서와 갱신 순서가 같다.
    // now()(트랜잭션 시작 시각)로 정하면 자정 전에 시작한 제출이 자정 뒤 제출보다 늦게 갱신돼 연속 일수가 1로 줄 수 있다.
    // 제출 행이 거는 FOR KEY SHARE와 충돌하지 않게 FOR NO KEY UPDATE로 잠근다. 예제 실행은 기다리지 않는다.
    public void lockForSubmission(long userId) {
        jdbc.sql("select id from users where id = :userId for no key update")
                .param("userId", userId)
                .query(Long.class)
                .single();
    }

    // 사용자 제출을 저장한 트랜잭션 안에서 부른다. 저장이 실패하면 연속 일수도 바뀌지 않는다.
    // 오늘은 그 제출의 submitted_at 날짜(한국 시각)라 잔디·이번 주 달력과 같은 날을 본다.
    public void recordSubmission(long userId, long submissionId) {
        jdbc.sql("""
                update users set
                  streak_days = case
                    when last_active_date = t.today then streak_days
                    when last_active_date = t.today - 1 then streak_days + 1
                    else 1 end,
                  last_active_date = t.today
                from (select (submitted_at at time zone 'Asia/Seoul')::date as today
                      from submissions where id = :submissionId) t
                where id = :userId
                """)
                .param("userId", userId)
                .param("submissionId", submissionId)
                .update();
    }

    // 연속 일수와 이번 주 달력이 같은 시점을 보게 묶는다.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    UserStreak findStreak(long userId) {
        record Row(int streakDays, LocalDate lastActiveDate, LocalDate today) {
        }
        // 오늘은 now()(트랜잭션 시작)가 아니라 이 문장이 도는 시각이다. 스냅숏을 잡은 뒤의 시각이라, 보이는 제출의
        // submitted_at(잠금 뒤 clock_timestamp)보다 늦다. 그래서 last_active_date가 오늘보다 뒤일 수 없다.
        Row row = jdbc.sql("""
                select streak_days, last_active_date, (clock_timestamp() at time zone 'Asia/Seoul')::date as today
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
