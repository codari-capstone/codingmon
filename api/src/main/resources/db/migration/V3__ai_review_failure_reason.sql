-- AI 결과를 만들지 못한 이유(#81, docs/AI_FEATURES.md 8절). FAILED 행에만 있고, 다시 시도해 PENDING으로 되돌리면 지운다.
-- UNAVAILABLE 장애(타임아웃·연결 실패·5xx·미설정), RATE_LIMITED AI 서버의 429, BUSY 이 서버의 AI 대기열이 참,
-- INVALID_RESPONSE 다시 요청해도 스키마를 어긴 응답, INTERNAL 그 밖의 서버 오류(입력 준비·결과 저장 실패).
-- 처리 중에 서버가 내려가 버려진 PENDING은 행이 PENDING 그대로라 여기에 값이 없고, 조회할 때 UNAVAILABLE로 읽는다.
ALTER TABLE ai_reviews ADD COLUMN failure_reason VARCHAR(20)
    CHECK (failure_reason IS NULL
        OR failure_reason IN ('UNAVAILABLE', 'RATE_LIMITED', 'BUSY', 'INVALID_RESPONSE', 'INTERNAL'));

-- 이유를 남기기 전의 실패는 대부분 AI 서버가 없거나 응답하지 않은 경우라 장애로 채운다.
UPDATE ai_reviews SET failure_reason = 'UNAVAILABLE' WHERE status = 'FAILED';

-- 실패만 이유를 가진다. 다시 시도할 때 이유를 지우지 않으면 PENDING 행이 이전 실패의 이유를 달고 보이므로 양쪽으로 건다.
ALTER TABLE ai_reviews ADD CONSTRAINT ai_reviews_failure_reason_status_check
    CHECK ((status = 'FAILED') = (failure_reason IS NOT NULL));
