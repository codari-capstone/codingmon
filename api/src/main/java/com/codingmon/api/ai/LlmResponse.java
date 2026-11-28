package com.codingmon.api.ai;

// json은 모델 응답 원문이다. ai_reviews.content에는 이것 대신 사실 검증(#79)으로 고친 value를 다시 써서 저장한다(AiReviewRunner).
// usage에는 재요청까지 합친 토큰 수가 들어 있다.
record LlmResponse<T>(T value, String json, LlmUsage usage) {
}
