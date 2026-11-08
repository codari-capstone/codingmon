package com.codingmon.api.ai;

import java.time.Instant;
import java.util.List;

// 화면에 주는 AI 코드 리뷰(contracts의 SubmissionCodeReview, AI-05). 리뷰 내용은 COMPLETED이고 차단(blocked)되지 않았을 때만 채운다.
// failureReason은 FAILED일 때만 있다(AI-06, #81). quota는 응답할 때의 오늘 남은 횟수다(AI-01).
record CodeReviewView(long submissionId, AiReviewRepository.Status status, AiReviewRepository.FailureReason failureReason,
        boolean blocked, String summary,
        CodeReviewResult.Complexity complexity, List<String> improvements, List<CodeReviewResult.Concept> nextConcepts,
        Instant createdAt, Instant completedAt, AiQuota quota) {

    // result가 null이면 내용 없이 상태만 담는다(끝나지 않았거나 실패했거나 차단됐다).
    static CodeReviewView of(AiReviewRepository.Stored stored, boolean blocked, CodeReviewResult result, AiQuota quota) {
        if (result == null) {
            return new CodeReviewView(stored.submissionId(), stored.status(), stored.failureReason(), blocked, null, null,
                    List.of(), List.of(),
                    stored.createdAt(), stored.completedAt(), quota);
        }
        return new CodeReviewView(stored.submissionId(), stored.status(), null, false, result.summary(), result.complexity(),
                result.improvements(), result.nextConcepts(), stored.createdAt(), stored.completedAt(), quota);
    }
}
