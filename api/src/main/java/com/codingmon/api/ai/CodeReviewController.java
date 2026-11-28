package com.codingmon.api.ai;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

// AI 코드 리뷰 요청·조회(AI-05, 기술명세서 AI-004). 동작은 CodeReviewService에 있다.
@RestController
class CodeReviewController {

    private final CodeReviewService reviews;

    CodeReviewController(CodeReviewService reviews) {
        this.reviews = reviews;
    }

    // 새로 만들기 시작했으면 202, 이미 있는 결과를 돌려주면 200이다.
    @PostMapping("/api/submissions/{id}/code-review")
    ResponseEntity<CodeReviewView> request(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        CodeReviewService.Requested requested = reviews.request(userId(jwt), id);
        boolean pending = requested.view().status() == AiReviewRepository.Status.PENDING;
        return ResponseEntity.status(requested.started() && pending ? HttpStatus.ACCEPTED : HttpStatus.OK)
                .body(requested.view());
    }

    @GetMapping("/api/submissions/{id}/code-review")
    CodeReviewView find(@PathVariable long id, @AuthenticationPrincipal Jwt jwt) {
        return reviews.find(userId(jwt), id);
    }

    private static long userId(Jwt jwt) {
        return Long.parseLong(jwt.getSubject());
    }
}
