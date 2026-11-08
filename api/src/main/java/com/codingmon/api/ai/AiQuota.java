package com.codingmon.api.ai;

import java.time.Instant;

// 오늘 남은 AI 분석·리뷰 횟수(contracts의 AiQuota, AI-01). 세는 기준은 AiReviewRepository.usedToday에 있다.
record AiQuota(int limit, int used, int remaining, Instant resetsAt) {

    static AiQuota of(int limit, AiReviewRepository.Usage usage) {
        return new AiQuota(limit, usage.used(), Math.max(0, limit - usage.used()), usage.resetsAt());
    }
}
