-- 연속 학습(STREAK-01·02, #245). 제출할 때 갱신해 두고, 조회할 때는 이 두 칸만 읽는다.
-- 제출 기록 전체를 거슬러 세면 한 사람의 기록이 쌓일수록 느려지기 때문이다.
-- streak_days: last_active_date까지 이어진 날 수. 끊겨도 0으로 고치지 않는다.
--   last_active_date가 어제보다 전이면 읽을 때 0으로 본다(UserActivityRepository.findStreak). 자정에 돌릴 작업이 필요 없다.
-- last_active_date: 마지막으로 제출한 날(한국 시각). 제출한 적이 없으면 비어 있다.
-- 기존 회원은 서비스 공개 전 테스트 계정뿐이라 지난 제출로 채우지 않고 0에서 시작한다.
ALTER TABLE users ADD COLUMN streak_days INT NOT NULL DEFAULT 0 CHECK (streak_days >= 0);
ALTER TABLE users ADD COLUMN last_active_date DATE;
