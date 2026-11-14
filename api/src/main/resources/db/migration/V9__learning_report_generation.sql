-- 학습 리포트(F4)를 만들고 저장한다(#85, docs/AI_FEATURES.md 7절).

-- 추천 이유는 AI가 쓰고 리포트 내용(learning_reports.content)에 순위별로 저장한다(#84 논의). 추천 행은 AI 응답 전에 저장하므로
-- 이 열을 채울 수 없다. 리포트를 만드는 코드가 없던 때라 지울 값도 없다.
ALTER TABLE learning_report_recommendations DROP COLUMN reason;

-- 만들지 못한 이유. 값과 뜻은 ai_reviews.failure_reason(V3)과 같고, 화면은 이 구분으로 안내 문구를 고른다(AI-06).
-- FAILED 행에만 있고, 다시 시도해 PENDING으로 되돌리면 지운다. 처리 중에 서버가 내려가 남은 PENDING은 조회할 때 UNAVAILABLE로 읽는다.
ALTER TABLE learning_reports ADD COLUMN failure_reason VARCHAR(20)
    CHECK (failure_reason IS NULL
        OR failure_reason IN ('UNAVAILABLE', 'RATE_LIMITED', 'BUSY', 'INVALID_RESPONSE', 'INTERNAL'));
UPDATE learning_reports SET failure_reason = 'UNAVAILABLE' WHERE status = 'FAILED';
ALTER TABLE learning_reports ADD CONSTRAINT learning_reports_failure_reason_status_check
    CHECK ((status = 'FAILED') = (failure_reason IS NOT NULL));

-- 품질 평가에서 프롬프트 버전별로 결과를 나눠 보고(LLM_PROMPT_VERSION_LEARNING_REPORT), 분석·리뷰처럼 쓴 토큰을 남긴다.
-- 토큰은 시도마다 더한다(실패한 시도의 토큰도 남는다). model처럼 비어도 되게 둔다.
ALTER TABLE learning_reports ADD COLUMN prompt_version VARCHAR(80);
ALTER TABLE learning_reports ADD COLUMN input_tokens INTEGER CHECK (input_tokens IS NULL OR input_tokens >= 0);
ALTER TABLE learning_reports ADD COLUMN output_tokens INTEGER CHECK (output_tokens IS NULL OR output_tokens >= 0);
