-- 배지(BADGE-01~03, #248). 받은 배지만 행으로 둔다. 못 받은 배지는 행이 없다.
-- (user_id, code) PK가 같은 배지를 두 번 주지 않게 막아, 동시에 채점이 끝나도 하나만 남는다.
-- celebrated_at: 축하 창을 띄운 시각. 비어 있으면 아직 띄우지 않았다.
-- 기능 전 기록으로 미리 채우지 않는다(기능명세 12절).
CREATE TABLE user_badges (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code VARCHAR(24) NOT NULL CHECK (code IN (
        'FIRST_SOLVE', 'STREAK_3', 'STREAK_7', 'STREAK_14', 'MEDIUM_SOLVER', 'HARD_SOLVER',
        'FIRST_TRY', 'NO_HINT', 'RETRY', 'PERSISTENCE', 'INTERMEDIATE', 'MASTER')),
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    celebrated_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, code)
);
