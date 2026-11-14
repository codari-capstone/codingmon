package com.codingmon.api.ai;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

// 학습 리포트 만들기·조회(REP-03~05, 기술명세서 LEARNING-001·003). 동작은 LearningReportService에 있다.
// 요청할 때마다 다시 계산하는 통계(GET /api/users/me/learning-stats, LearningStatsController)와 달리 하루 1회 저장한다.
@RestController
class LearningReportController {

    private final LearningReportService reports;

    LearningReportController(LearningReportService reports) {
        this.reports = reports;
    }

    // 새로 만들기 시작했으면 202, 이미 있는 오늘 리포트를 돌려주면 200이다. 시작했어도 응답 전에 끝났으면(대기열이 차 BUSY,
    // 모델 서버가 바로 거절) 그 상태로 200이다.
    @PostMapping("/api/users/me/learning-report")
    ResponseEntity<LearningReportView> request(@AuthenticationPrincipal Jwt jwt) {
        LearningReportService.Requested requested = reports.request(userId(jwt));
        boolean pending = requested.view().status() == AiReviewRepository.Status.PENDING;
        return ResponseEntity.status(requested.started() && pending ? HttpStatus.ACCEPTED : HttpStatus.OK)
                .body(requested.view());
    }

    @GetMapping("/api/users/me/learning-report")
    LearningReportView find(@AuthenticationPrincipal Jwt jwt) {
        return reports.find(userId(jwt));
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
