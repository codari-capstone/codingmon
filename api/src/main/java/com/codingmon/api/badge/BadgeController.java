package com.codingmon.api.badge;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.codingmon.api.ApiErrors;

@RestController
class BadgeController {

    private final BadgeRepository badges;

    BadgeController(BadgeRepository badges) {
        this.badges = badges;
    }

    // BADGE-01·02
    @GetMapping("/api/users/me/badges")
    BadgeRepository.UserBadges list(@AuthenticationPrincipal Jwt jwt) {
        return badges.find(Long.parseLong(jwt.getSubject()));
    }

    // BADGE-03. 12개 코드가 아니면 경로 값을 바꾸는 단계에서 code 없는 400이 된다.
    @PostMapping("/api/users/me/badges/{code}/celebrated")
    ResponseEntity<Void> celebrated(@PathVariable BadgeCode code, @AuthenticationPrincipal Jwt jwt) {
        if (!badges.markCelebrated(Long.parseLong(jwt.getSubject()), code)) {
            throw ApiErrors.error(HttpStatus.NOT_FOUND, "BADGE_NOT_UNLOCKED", "아직 받지 않은 배지예요");
        }
        return ResponseEntity.noContent().build();
    }
}
