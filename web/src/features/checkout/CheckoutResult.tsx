import { Link } from 'react-router'

import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'
import { Mascot } from '@/components/ui/mascot'
import { TEST_PAYMENT_NOTICE, won, proCharge } from '@/features/pricing/plans'
import { formatLongDate, SUBSCRIPTION_PATH } from '@/features/subscription/subscriptionQuery'
import { cn } from '@/lib/utils'
import type { CheckoutOutcome } from './outcome'

const CYCLE_NAME = { monthly: '월간', yearly: '연간' } as const

const ICON_TONE = {
  warning: 'bg-warning-soft text-warning-text',
  info: 'bg-info-soft text-info-text',
  danger: 'bg-destructive-soft text-destructive-text',
} as const

function ToneIcon({ name, tone }: { name: IconName; tone: keyof typeof ICON_TONE }) {
  return (
    <span
      className={cn(
        'inline-flex size-16 items-center justify-center rounded-full',
        ICON_TONE[tone],
      )}
    >
      <Icon name={name} size={28} />
    </span>
  )
}

/** 결제 결과 (PAY-02). 상태마다 그림·제목·설명·버튼만 바꾼다. 맨 아래 테스트 결제 안내는 늘 둔다 */
export function CheckoutResult({
  outcome,
  onRetry,
}: {
  outcome: CheckoutOutcome
  onRetry: () => void
}) {
  const retry = (variant: 'primary' | 'secondary') => (
    <Button key="retry" type="button" size="lg" variant={variant} fullWidth onClick={onRetry}>
      다시 시도
    </Button>
  )
  const mySubscription = (variant: 'primary' | 'secondary') => (
    <Button key="sub" asChild size="lg" variant={variant} fullWidth>
      <Link to={SUBSCRIPTION_PATH}>내 구독 보기</Link>
    </Button>
  )

  let art: React.ReactNode
  let title: string
  let body: React.ReactNode
  let actions: React.ReactNode[]
  switch (outcome.kind) {
    case 'success': {
      const end = outcome.subscription.currentPeriodEnd
      art = <Mascot pose="success" size={192} />
      title = '프로 구독이 시작됐어요'
      body = (
        <>
          <p className="m-0">이제 AI 오답 분석을 하루 30회, 힌트는 3단계까지 쓸 수 있어요.</p>
          <dl className="bg-muted m-0 mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[14px] px-5 py-4 text-left text-[15px]">
            <dt className="text-muted-foreground">플랜</dt>
            <dd className="text-foreground m-0 font-semibold">
              프로 {CYCLE_NAME[outcome.cycle]} · {won(proCharge(outcome.cycle))}원
            </dd>
            {end ? (
              <>
                <dt className="text-muted-foreground">다음 결제일</dt>
                <dd className="text-foreground m-0">{formatLongDate(end)}</dd>
              </>
            ) : null}
          </dl>
        </>
      )
      actions = [
        <Button key="go" asChild size="lg" fullWidth>
          <Link to="/problems">문제 풀러 가기</Link>
        </Button>,
        mySubscription('secondary'),
      ]
      break
    }
    case 'provider':
      art = <ToneIcon name="clock" tone="warning" />
      title = '결제 서비스에 잠시 연결할 수 없어요'
      body = <p className="m-0">이번 요청은 결제되지 않았어요. 잠시 뒤 다시 시도해 주세요.</p>
      actions = [retry('primary')]
      break
    case 'unknown':
      art = <ToneIcon name="clock" tone="info" />
      title = '결제 결과를 확인하고 있어요'
      body = (
        <p className="m-0">
          잠시 뒤 마이페이지 구독에서 확인해 주세요. 다시 결제해도 두 번 나가지 않아요.
        </p>
      )
      actions = [retry('secondary'), mySubscription('primary')]
      break
    case 'failed':
      art = <ToneIcon name="x" tone="danger" />
      title = '결제하지 못했어요'
      body = (
        <>
          <p className="m-0">카드는 등록되지 않았고 결제도 되지 않았어요.</p>
          {outcome.reason ? (
            <p className="bg-destructive-soft text-body-foreground m-0 mt-6 rounded-[14px] px-5 py-4 text-left text-[15px]">
              <strong className="text-destructive-text font-bold">실패 이유</strong> ·{' '}
              {outcome.reason}
            </p>
          ) : null}
        </>
      )
      actions = [
        <Button key="back" asChild size="lg" variant="secondary" fullWidth>
          <Link to="/pricing">요금제로 돌아가기</Link>
        </Button>,
        retry('primary'),
      ]
      break
  }

  return (
    <section
      aria-labelledby="checkout-result-title"
      className="bg-card shadow-card mx-auto mt-6 flex w-full max-w-[560px] flex-col items-center rounded-[28px] px-6 py-10 text-center md:px-10"
    >
      {art}
      <h1
        id="checkout-result-title"
        // 결과가 바뀐 것을 화면 읽기 프로그램이 알도록 제목에 초점을 옮긴다(CheckoutPage)
        tabIndex={-1}
        className="text-foreground m-0 mt-6 text-2xl font-bold tracking-[-0.02em] outline-none"
      >
        {title}
      </h1>
      <div className="text-muted-foreground mt-2 w-full text-[15px] leading-[1.6]">{body}</div>
      <div
        className={cn(
          'mt-6 grid w-full gap-2.5',
          actions.length === 1 ? 'mx-auto max-w-[240px]' : 'sm:grid-cols-2',
        )}
      >
        {actions}
      </div>
      <p className="text-muted-foreground m-0 mt-5 text-[13px]">{TEST_PAYMENT_NOTICE}</p>
    </section>
  )
}
