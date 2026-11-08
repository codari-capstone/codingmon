package com.codingmon.api.ai;

// AI 코드 리뷰(F3)에 보내는 근거(AI_FEATURES 6절). AnalysisInputRepository가 제출 하나로 만든 AnalysisInput에서 문제와 제출만 가져온다.
// 정답 제출이라 공개 예제와 비공개 테스트는 모두 통과했으므로 보내지 않는다. 알려 줄 것이 없고 토큰만 쓴다.
// 글 상한, 줄 번호, 비공개 테스트 보호는 AnalysisInput을 그대로 따른다.
record CodeReviewInput(AnalysisInput.Problem problem, AnalysisInput.Submission submission) {

    static CodeReviewInput of(AnalysisInput input) {
        return new CodeReviewInput(input.problem(), input.submission());
    }

    String toJson() {
        return AnalysisInput.JSON.writeValueAsString(this);
    }
}
