-- 코드 리뷰의 '다음에 배울 개념'(CodeReviewResult.nextConcepts)을 개념 태그와 맞춰 저장한다(#83).
-- 원문은 ai_reviews.content에도 그대로 있다. 이 표는 학습 리포트(F4)가 사용자별로 모아 읽으려고 둔다.
-- 리뷰가 COMPLETED로 저장되는 트랜잭션에서 함께 쓴다. 차단된 결과({"blocked": true})에는 행이 없다.
CREATE TABLE ai_review_next_concepts (
    ai_review_id BIGINT NOT NULL REFERENCES ai_reviews(id) ON DELETE CASCADE,
    -- 리뷰 응답 배열의 순서(1부터)
    ordinal SMALLINT NOT NULL CHECK (ordinal BETWEEN 1 AND 3),
    -- 모델이 쓴 개념 이름과 이유. 태그와 맞지 않아도 그대로 둔다
    name TEXT NOT NULL,
    reason TEXT NOT NULL,
    -- 맞춘 태그. 맞는 태그가 없으면 NULL이다. 다른 표는 태그 삭제를 막지만(RESTRICT) 이 표는 리뷰가 남긴 기록이라,
    -- 태그가 지워져도 원문은 남기고 연결만 끊는다
    concept_tag_id BIGINT REFERENCES concept_tags(id) ON DELETE SET NULL,
    PRIMARY KEY (ai_review_id, ordinal)
);
