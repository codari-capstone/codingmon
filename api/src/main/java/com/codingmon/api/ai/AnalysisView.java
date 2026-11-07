package com.codingmon.api.ai;

import java.time.Instant;
import java.util.List;

// 화면에 주는 AI 오답 분석(contracts의 SubmissionAnalysis). 힌트는 연 단계까지만 담는다(AI-002).
// 분석 내용은 COMPLETED일 때만 채운다.
record AnalysisView(long submissionId, AiReviewRepository.Status status, String summary, List<Integer> suspectLines,
        List<String> facts, List<String> guesses, int revealedHintLevel, List<String> hints, Instant createdAt,
        Instant completedAt) {

    static AnalysisView of(AiReviewRepository.Stored stored, AnalysisResult result) {
        if (result == null) {
            return new AnalysisView(stored.submissionId(), stored.status(), null, List.of(), List.of(), List.of(),
                    stored.revealedHintLevel(), List.of(), stored.createdAt(), stored.completedAt());
        }
        List<String> hints = List.of(result.hints().observation(), result.hints().direction(), result.hints().principle());
        return new AnalysisView(stored.submissionId(), stored.status(), result.summary(), result.suspectLines(),
                result.facts(), result.guesses(), stored.revealedHintLevel(),
                hints.subList(0, stored.revealedHintLevel()), stored.createdAt(), stored.completedAt());
    }
}
