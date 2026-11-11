-- 관리자 회원 관리(ADM-14~16, #227). 가입일과 계정 정지를 기록한다.
-- created_at: 새 회원은 가입할 때 채워진다. 이 칸을 추가하기 전에 가입한 회원은 실제 가입일을 알 수 없어 비워 둔다
-- (기본값을 나중에 걸어 기존 행이 이 시각으로 채워지지 않게 한다).
ALTER TABLE users ADD COLUMN created_at TIMESTAMPTZ;
ALTER TABLE users ALTER COLUMN created_at SET DEFAULT now();

-- suspended_at: 정지한 시각. 값이 있으면 토큰을 발급하지 않는다(AuthTokenService.issue). 강제 탈퇴는 이 시각에서 24시간 뒤부터다.
-- suspension_reason: 정지할 때 관리자가 적은 사유(선택). 관리자끼리만 본다. 해제하면 지운다.
ALTER TABLE users ADD COLUMN suspended_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN suspension_reason VARCHAR(1000);
-- 관리자는 정지할 수 없다. 사유는 정지됐을 때만 있다.
ALTER TABLE users ADD CONSTRAINT users_suspension_check
    CHECK ((suspended_at IS NULL OR role = 'USER') AND (suspended_at IS NOT NULL OR suspension_reason IS NULL));
