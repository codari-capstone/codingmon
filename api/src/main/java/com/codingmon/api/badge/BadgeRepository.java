package com.codingmon.api.badge;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.codingmon.api.learning.UserActivityRepository;
import com.codingmon.api.learning.UserActivityRepository.SolvedByDifficulty;
import com.codingmon.api.submission.UserProblemStatsRepository.Judged;

// 배지(BADGE-01~03, #248). 받는 조건과 주는 때는 기능명세 12절이 기준이다.
// 이미 받은 배지는 다시 확인하지 않는다. 같은 배지를 동시에 주려 하면 PK가 하나만 남긴다.
@Repository
public class BadgeRepository {

    private static final int MEDIUM_SOLVER_COUNT = 5;
    private static final int RETRY_MIN_ATTEMPTS = 6; // 5번 이상 틀린 뒤 맞힘
    private static final int PERSISTENCE_SUBMISSIONS = 50;

    record UserBadge(BadgeCode code, OffsetDateTime unlockedAt, boolean celebrated) {
    }

    record UserBadges(List<UserBadge> badges) {
    }

    private final JdbcClient jdbc;
    private final UserActivityRepository activity;

    BadgeRepository(JdbcClient jdbc, UserActivityRepository activity) {
        this.jdbc = jdbc;
        this.activity = activity;
    }

    // 제출 API가 연속 일수를 갱신한 바로 뒤 같은 트랜잭션에서 부른다. 3·7·14일에 닿거나 넘었고 아직 없는 배지만 준다.
    // 명세는 그날 첫 제출에서 확인하지만, 같은 날 다음 제출은 연속 일수가 그대로라 아무것도 주지 않으므로 결과가 같다.
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordStreak(long userId) {
        jdbc.sql("""
                insert into user_badges (user_id, code)
                select u.id, c.code from users u
                join (values ('STREAK_3', 3), ('STREAK_7', 7), ('STREAK_14', 14)) c(code, days) on u.streak_days >= c.days
                where u.id = :userId
                on conflict do nothing
                """)
                .param("userId", userId)
                .update();
    }

    // 채점 처리기가 제출을 COMPLETED로 바꾼 트랜잭션에서 부른다. judged는 풀이 통계가 만들거나 고친 행이다.
    // 끈기는 판정이 난 사용자 제출마다, 나머지는 그 문제를 처음 맞힌 제출(judged.solved)에서만 확인한다.
    @Transactional(propagation = Propagation.MANDATORY)
    public void recordJudged(long submissionId, Optional<Judged> judged) {
        Optional<Long> owner = jdbc.sql("select user_id from submissions where id = :id and submission_kind = 'SUBMIT'")
                .param("id", submissionId)
                .query(Long.class)
                .optional();
        if (owner.isEmpty()) {
            return;
        }
        long userId = owner.get();
        Set<BadgeCode> have = unlocked(userId);
        List<BadgeCode> add = new ArrayList<>();
        if (!have.contains(BadgeCode.PERSISTENCE) && judgedSubmissions(userId) >= PERSISTENCE_SUBMISSIONS) {
            add.add(BadgeCode.PERSISTENCE);
        }
        judged.filter(Judged::solved).ifPresent(first -> addFirstSolveBadges(userId, first, have, add));
        for (BadgeCode code : add) {
            jdbc.sql("insert into user_badges (user_id, code) values (:userId, :code) on conflict do nothing")
                    .param("userId", userId)
                    .param("code", code.name())
                    .update();
        }
    }

    private void addFirstSolveBadges(long userId, Judged first, Set<BadgeCode> have, List<BadgeCode> add) {
        String difficulty = difficulty(first.problemId());
        boolean medium = "MEDIUM".equals(difficulty);
        boolean hard = "HARD".equals(difficulty);
        boolean mediumOrHard = medium || hard;
        int attempts = first.attemptCount();
        addIf(add, have, BadgeCode.FIRST_SOLVE, true);
        addIf(add, have, BadgeCode.HARD_SOLVER, hard);
        addIf(add, have, BadgeCode.FIRST_TRY, mediumOrHard && attempts == 1);
        addIf(add, have, BadgeCode.NO_HINT, mediumOrHard && attempts >= 2 && first.maxRevealedHintLevel() == 0);
        addIf(add, have, BadgeCode.RETRY, attempts >= RETRY_MIN_ATTEMPTS);
        if (!have.contains(BadgeCode.MEDIUM_SOLVER) || !have.contains(BadgeCode.INTERMEDIATE)) {
            SolvedByDifficulty solved = activity.solvedByDifficulty(userId);
            addIf(add, have, BadgeCode.MEDIUM_SOLVER, medium && solved.MEDIUM() >= MEDIUM_SOLVER_COUNT);
            addIf(add, have, BadgeCode.INTERMEDIATE, solved.EASY() >= 10 && solved.MEDIUM() >= 10 && solved.HARD() >= 1);
        }
        addIf(add, have, BadgeCode.MASTER, !have.contains(BadgeCode.MASTER) && solvedAllPublished(userId));
    }

    private static void addIf(List<BadgeCode> add, Set<BadgeCode> have, BadgeCode code, boolean condition) {
        if (condition && !have.contains(code)) {
            add.add(code);
        }
    }

    // MY-05와 같이 공개 중인 버전의 난이도. 공개가 내려간 문제는 마지막으로 공개됐던 버전을 따른다.
    private String difficulty(long problemId) {
        return jdbc.sql("""
                select difficulty from problem_versions
                where problem_id = :problemId and published_at is not null
                order by published_at desc limit 1
                """)
                .param("problemId", problemId)
                .query(String.class)
                .optional()
                .orElse(null);
    }

    // 예제 실행·정답 코드 검증·채점 불가·채점 중은 세지 않는다. 받기 전까지만 세므로 많아야 50줄 남짓 읽는다.
    private int judgedSubmissions(long userId) {
        return jdbc.sql("""
                select count(*) from submissions
                where user_id = :userId and submission_kind = 'SUBMIT' and job_status = 'COMPLETED'
                """)
                .param("userId", userId)
                .query(Integer.class)
                .single();
    }

    // 공개 중인 문제를 모두 맞혔는지. 공개가 내려간 문제는 세지 않는다.
    private boolean solvedAllPublished(long userId) {
        return jdbc.sql("""
                select not exists (
                  select 1 from problem_versions v
                  where v.status = 'PUBLISHED'
                    and not exists (
                      select 1 from user_problem_stats s
                      where s.user_id = :userId and s.problem_id = v.problem_id and s.solved))
                """)
                .param("userId", userId)
                .query(Boolean.class)
                .single();
    }

    private Set<BadgeCode> unlocked(long userId) {
        Set<BadgeCode> codes = EnumSet.noneOf(BadgeCode.class);
        jdbc.sql("select code from user_badges where user_id = :userId")
                .param("userId", userId)
                .query(String.class)
                .list()
                .forEach(code -> codes.add(BadgeCode.valueOf(code)));
        return codes;
    }

    // BADGE-01. 12개를 BadgeCode 순서로 채운다. 못 받은 배지는 unlockedAt이 null이고 celebrated는 false다.
    @Transactional(readOnly = true)
    UserBadges find(long userId) {
        record Row(BadgeCode code, OffsetDateTime unlockedAt, boolean celebrated) {
        }
        Map<BadgeCode, Row> rows = jdbc.sql("""
                select code, unlocked_at, celebrated_at is not null as celebrated
                from user_badges where user_id = :userId
                """)
                .param("userId", userId)
                .query((rs, n) -> new Row(BadgeCode.valueOf(rs.getString("code")),
                        rs.getObject("unlocked_at", OffsetDateTime.class), rs.getBoolean("celebrated")))
                .list().stream()
                .collect(Collectors.toMap(Row::code, Function.identity()));
        return new UserBadges(Arrays.stream(BadgeCode.values())
                .map(code -> {
                    Row row = rows.get(code);
                    return row == null ? new UserBadge(code, null, false)
                            : new UserBadge(code, row.unlockedAt(), row.celebrated());
                })
                .toList());
    }

    // BADGE-03. 이미 축하했으면 처음 시각을 그대로 둔다. 받지 않은 배지면 false다.
    @Transactional
    boolean markCelebrated(long userId, BadgeCode code) {
        return jdbc.sql("""
                update user_badges set celebrated_at = coalesce(celebrated_at, now())
                where user_id = :userId and code = :code
                """)
                .param("userId", userId)
                .param("code", code.name())
                .update() == 1;
    }
}
