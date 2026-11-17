-- 처음 안내(WELCOME-01, #246). 처음 안내 화면을 열었는지만 둔다. 언제 열었는지는 쓰는 곳이 없어 저장하지 않는다.
-- 이 기능 전에 가입한 회원에게는 띄우지 않으려고 true로 채운 뒤, 새로 가입하는 회원부터 false가 되게 기본값을 바꾼다.
ALTER TABLE users ADD COLUMN welcome_seen BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ALTER COLUMN welcome_seen SET DEFAULT false;
