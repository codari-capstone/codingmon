package com.codingmon.api.ai;

import java.time.Instant;
import java.util.List;

// 화면에 주는 AI 오답 분석(contracts의 SubmissionAnalysis). 힌트는 연 단계까지만 담는다(AI-002).
// 분석 내용은 COMPLETED이고 차단(blocked)되지 않았을 때만 채운다. failureReason은 FAILED일 때만 있다(AI-06, #81).
// quota는 응답할 때의 오늘 남은 횟수다(AI-01).
record AnalysisView(long submissionId, AiReviewRepository.Status status, AiReviewRepository.FailureReason failureReason,
        boolean blocked, String summary,
        List<Integer> suspectLines, List<String> facts, List<String> guesses, int revealedHintLevel, List<String> hints,
        Instant createdAt, Instant completedAt, AiQuota quota) {

    // result가 null이면 내용 없이 상태만 담는다(끝나지 않았거나 실패했거나 차단됐다).
    static AnalysisView of(AiReviewRepository.Stored stored, boolean blocked, AnalysisResult result, AiQuota quota) {
        if (result == null) {
            return new AnalysisView(stored.submissionId(), stored.status(), stored.failureReason(), blocked, null,
                    List.of(), List.of(),
                    List.of(), stored.revealedHintLevel(), List.of(), stored.createdAt(), stored.completedAt(), quota);
        }
        List<String> hints = List.of(result.hints().observation(), result.hints().direction(), result.hints().principle());
        return new AnalysisView(stored.submissionId(), stored.status(), null, false, result.summary(), result.suspectLines(),
                result.facts(), result.guesses(), stored.revealedHintLevel(),
                hints.subList(0, stored.revealedHintLevel()), stored.createdAt(), stored.completedAt(), quota);
    }
}
