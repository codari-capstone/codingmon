package com.codingmon.api.ai;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

// 오늘 남은 AI 분석·리뷰 횟수(AI-01). 분석 응답의 quota와 같은 값이다.
@RestController
class AiQuotaController {

    private final AiQuotaService quota;

    AiQuotaController(AiQuotaService quota) {
        this.quota = quota;
    }

    @GetMapping("/api/users/me/ai-quota")
    AiQuota find(@AuthenticationPrincipal Jwt jwt) {
        return quota.status(Long.parseLong(jwt.getSubject()));
    }
}
