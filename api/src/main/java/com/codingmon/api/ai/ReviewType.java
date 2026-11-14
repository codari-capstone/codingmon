package com.codingmon.api.ai;

// AI 기능의 종류. 프롬프트 버전을 기능별로 따로 올린다.
// ANALYSIS·CODE_REVIEW는 ai_reviews.review_type과 같다. LEARNING_REPORT는 learning_reports에 저장하므로 ai_reviews에는 쓰지 않는다
// (review_type CHECK가 막는다).
enum ReviewType {
    ANALYSIS,
    CODE_REVIEW,
    LEARNING_REPORT
}
