package com.codingmon.api.ai;

import java.time.Instant;

// 오늘 남은 AI 분석·리뷰 횟수(contracts의 AiQuota, AI-01). 세는 기준은 AiReviewRepository.usedToday에 있다.
// 관리자는 한도가 없어 limit·remaining이 null이다. 쓴 횟수(used)는 그대로 센다.
public record AiQuota(Integer limit, int used, Integer remaining, Instant resetsAt) {

    static AiQuota of(int limit, AiReviewRepository.Usage usage) {
        if (usage.admin()) {
            return new AiQuota(null, usage.used(), null, usage.resetsAt());
        }
        return new AiQuota(limit, usage.used(), Math.max(0, limit - usage.used()), usage.resetsAt());
    }
}
