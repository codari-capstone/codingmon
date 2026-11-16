-- 접수 상한은 미완료인 학습자 작업만 센다. 누적된 완료 기록 전체를 매 요청마다 훑지 않는다.
CREATE INDEX submissions_pending_user_idx ON submissions (user_id)
    WHERE submission_kind IN ('SUBMIT', 'SAMPLE_RUN')
      AND job_status IN ('QUEUED', 'COMPILING', 'RUNNING');
