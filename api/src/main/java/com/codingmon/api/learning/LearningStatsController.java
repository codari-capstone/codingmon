package com.codingmon.api.learning;

import java.time.LocalDate;
import java.time.ZoneId;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.codingmon.api.learning.LearningStatsRepository.LearningStats;

@RestController
class LearningStatsController {

    // 서비스를 시작한 해. 잔디는 이 해부터 고를 수 있다. 올해가 아니므로 해가 바뀌어도 고치지 않는다.
    private static final int FIRST_YEAR = 2026;

    private final LearningStatsRepository stats;
    private final UserActivityRepository activity;

    LearningStatsController(LearningStatsRepository stats, UserActivityRepository activity) {
        this.stats = stats;
        this.activity = activity;
    }

    // REP-01·02. 요청할 때마다 다시 계산한다. 하루 1회 저장하는 리포트(#85)와 다르다.
    @GetMapping("/api/users/me/learning-stats")
    LearningStats get(@AuthenticationPrincipal Jwt jwt) {
        return stats.find(Long.parseLong(jwt.getSubject()));
    }

    // MY-05. year를 빼면 한국 시각으로 올해다. 트랜잭션을 열기 전에 범위를 검사한다.
    @GetMapping("/api/users/me/activity")
    UserActivityRepository.UserActivity activity(@AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false) Integer year) {
        int thisYear = LocalDate.now(ZoneId.of("Asia/Seoul")).getYear();
        int y = year == null ? thisYear : year;
        if (y < FIRST_YEAR || y > thisYear) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "year는 " + FIRST_YEAR + "부터 올해(" + thisYear + ")까지다");
        }
        return activity.find(Long.parseLong(jwt.getSubject()), y);
    }

    // STREAK-01·02
    @GetMapping("/api/users/me/streak")
    UserActivityRepository.UserStreak streak(@AuthenticationPrincipal Jwt jwt) {
        return activity.findStreak(Long.parseLong(jwt.getSubject()));
    }
}
