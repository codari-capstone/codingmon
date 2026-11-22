-- 프로 구독 결제(PAY-01·02, MY-06, #332). 포트원 V2 테스트 채널로 빌링키를 받아 서버가 바로 결제한다.

-- customer_id: 카드 등록 때 포트원에 넘기는 고객 ID(cus-{UUID}). 처음 필요할 때 만들고 바꾸지 않는다.
-- DB 사용자 ID를 쓰지 않는다. 로컬·개발·배포가 테스트 상점 하나를 같이 쓰고 DB를 초기화하면 번호가 겹치기 때문이다.
ALTER TABLE users ADD COLUMN customer_id VARCHAR(64) UNIQUE;

-- 사용자당 한 행이다. 다시 구독하면 같은 행을 다시 쓴다(구독한 적이 없으면 행이 없고 NONE으로 본다).
-- anchor_at: 기준 시각(구독을 시작한 결제 시각). months: 확정한 개월 수(월간 1, 연간 12씩 더한다).
-- current_period_end: anchor_at + months를 한국 시간으로 센 값. 매번 계산하지 않도록 함께 저장한다.
-- last_applied_payment_id: 기간을 시작하거나 늘린 마지막 결제. 이 결제가 취소되면 구독을 끝낸다.
CREATE TABLE subscriptions (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('NONE', 'ACTIVE', 'CANCEL_SCHEDULED', 'PAYMENT_FAILED')),
    cycle VARCHAR(10) NOT NULL CHECK (cycle IN ('MONTHLY', 'YEARLY')),
    next_cycle VARCHAR(10) CHECK (next_cycle IN ('MONTHLY', 'YEARLY')),
    billing_key VARCHAR(200),
    anchor_at TIMESTAMPTZ NOT NULL,
    months INT NOT NULL CHECK (months > 0),
    current_period_end TIMESTAMPTZ NOT NULL,
    last_applied_payment_id VARCHAR(64),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- 다음 주기는 진행 중일 때만 둔다. 진행 중·해지 예정은 결제할 카드가 있어야 한다.
    CHECK (next_cycle IS NULL OR status = 'ACTIVE'),
    CHECK (billing_key IS NOT NULL OR status IN ('NONE', 'PAYMENT_FAILED'))
);
CREATE INDEX subscriptions_renewal_idx ON subscriptions (current_period_end) WHERE status IN ('ACTIVE', 'CANCEL_SCHEDULED');

-- 결제 기록. 포트원에 결제를 보내기 전에 PENDING으로 먼저 저장한다. 응답이 사라져도 같은 결제 ID로 다시 조회·재전송해
-- 두 번 결제되지 않게 하기 위해서다.
-- kind: FIRST는 구독 시작 결제, RENEWAL은 스케줄러의 갱신 결제.
-- needs_cancel: 돈은 나갔는데 구독에 반영하지 않은 결제(운영자가 콘솔에서 취소), 또는 1시간 넘게 결과를 모르는 결제(확인 필요).
-- paid_at: 처음에는 결제를 시도한 시각, 결제됨으로 확정하면 포트원이 준 실제 결제 시각으로 바꾼다.
CREATE TABLE payments (
    payment_id VARCHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind VARCHAR(10) NOT NULL CHECK (kind IN ('FIRST', 'RENEWAL')),
    cycle VARCHAR(10) NOT NULL CHECK (cycle IN ('MONTHLY', 'YEARLY')),
    amount INT NOT NULL CHECK (amount > 0),
    billing_key VARCHAR(200) NOT NULL,
    status VARCHAR(10) NOT NULL CHECK (status IN ('PENDING', 'PAID', 'FAILED', 'CANCELLED')),
    needs_cancel BOOLEAN NOT NULL DEFAULT false,
    paid_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- 결과를 모르는 결제는 사용자당 하나만. 결제 시작과 스케줄러가 겹쳐도 두 번째 PENDING을 만들지 못한다.
CREATE UNIQUE INDEX payments_one_pending_idx ON payments (user_id) WHERE status = 'PENDING';
CREATE INDEX payments_user_idx ON payments (user_id, paid_at DESC);
CREATE INDEX payments_needs_cancel_idx ON payments (user_id) WHERE needs_cancel;

-- 지울 빌링키 목록. 사용자와 연결하지 않아 탈퇴해도 남는다. 스케줄러가 포트원에서 지우고 성공하면 행을 지운다.
-- 탈퇴 때는 그 회원의 구독·결과 모름 결제의 빌링키를 넣는다(포트원에서 고객 ID로 찾지 않는다).
CREATE TABLE billing_key_deletions (
    id BIGSERIAL PRIMARY KEY,
    billing_key VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX billing_key_deletions_key_idx ON billing_key_deletions (billing_key);
