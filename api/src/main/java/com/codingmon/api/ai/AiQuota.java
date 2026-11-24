package com.codingmon.api.ai;

import java.time.Instant;

import com.codingmon.api.subscription.Subscriptions.Plan;

// 오늘 남은 AI 분석·리뷰 횟수(contracts의 AiQuota, AI-01). 세는 기준은 AiReviewRepository.usedToday에 있다.
// 한도는 요금제(plan)로 나눈다(PRICE-04). 관리자는 한도가 없어 limit·remaining이 null이다. 쓴 횟수(used)는 그대로 센다.
public record AiQuota(Plan plan, Integer limit, int used, Integer remaining, Instant resetsAt) {

    static AiQuota of(Plan plan, int limit, AiReviewRepository.Usage usage) {
        if (usage.admin()) {
            return new AiQuota(plan, null, usage.used(), null, usage.resetsAt());
        }
        return new AiQuota(plan, limit, usage.used(), Math.max(0, limit - usage.used()), usage.resetsAt());
    }

    // 열 수 있는 가장 높은 힌트 단계(contracts의 maxHintLevel). 무료 1, 프로와 관리자(한도 없음) 3.
    int maxHintLevel() {
        return plan == Plan.PRO || limit == null ? 3 : 1;
    }
}
