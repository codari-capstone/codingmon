package com.codingmon.api.ai;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

// AI 오답 분석 요청·조회와 힌트 열기(AI-01~04, HIST-02). 동작은 AnalysisService에 있다.
@RestController
class AnalysisController {

    record HintRequest(Integer level) {
    }

    private final AnalysisService analyses;

    AnalysisController(AnalysisService analyses) {
        this.analyses = analyses;
    }

    // 새로 만들기 시작했으면 202, 이미 있는 결과를 돌려주면 200이다.
    @PostMapping("/api/submissions/{id}/analysis")
    ResponseEntity<AnalysisView> request(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        AnalysisService.Requested requested = analyses.request(userId(jwt), id);
        boolean pending = requested.view().status() == AiReviewRepository.Status.PENDING;
        return ResponseEntity.status(requested.started() && pending ? HttpStatus.ACCEPTED : HttpStatus.OK)
                .body(requested.view());
    }

    @GetMapping("/api/submissions/{id}/analysis")
    AnalysisView find(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        return analyses.find(userId(jwt), id);
    }

    // 화면이 정상적으로는 1~3 밖을 보내지 않아 code 없이 답한다.
    @PostMapping("/api/submissions/{id}/analysis/hints")
    AnalysisView revealHint(@PathVariable long id, @RequestBody HintRequest body, @AuthenticationPrincipal Jwt jwt) {
        if (body.level() == null || body.level() < 1 || body.level() > 3) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        }
        return analyses.revealHint(userId(jwt), id, body.level());
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
