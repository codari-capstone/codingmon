import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import type { Subscription } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { LoadingState } from '@/components/LoadingState'
import { Alert } from '@/components/ui/alert'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { MyLayout } from '@/features/mypage/MyLayout'
import {
  AI_DAILY,
  CYCLE_NAME,
  PRO_PLAN,
  proCharge,
  TEST_PAYMENT_NOTICE,
  won,
  type Cycle,
} from '@/features/pricing/plans'
import { ActionResult, NextCycleBand, PlanActions } from './SubscriptionActions'
import {
  canChangeCycle,
  formatLongDate,
  fromBillingCycle,
  subscriptionQuery,
} from './subscriptionQuery'
import { PLAN_TITLE_ID, useSubscriptionAction } from './useSubscriptionAction'

const SHORT_DATE = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Seoul',
})

/** 다음 갱신 결제의 주기. 바꿨으면 `nextCycle`이다 */
const nextCycleOf = (s: Subscription): Cycle =>
  fromBillingCycle(s.nextCycle ?? s.cycle ?? 'MONTHLY')

const cycleText = (cycle: Cycle) =>
  cycle === 'yearly'
    ? `연간 · 매년 ${won(proCharge('yearly'))}원`
    : `월간 · 매월 ${won(proCharge('monthly'))}원`

interface View {
  name: string
  badge: { label: string; tone: BadgeTone }
  line: string
  action?: { label: string; to: string }
  alert?: { tone: 'info' | 'danger'; title: string; body: string }
}

/** 상태별 플랜 카드 (MY-06). 프로의 해지·해지 취소·주기 바꾸기 버튼은 SubscriptionActions가 그린다 */
function viewOf(s: Subscription): View {
  const cycle = s.cycle ? fromBillingCycle(s.cycle) : 'monthly'
  const end = s.currentPeriodEnd ? SHORT_DATE.format(new Date(s.currentPeriodEnd)) : null
  const free = `AI 오답 분석·풀이 제안 하루 ${AI_DAILY.free}회 · 힌트 1단계까지`
  // 첫 결제(결제 실패 뒤 다시 결제 포함)의 결과를 기다리는 중이면 다시 결제할 버튼을 숨긴다
  if (s.plan === 'FREE' && s.paymentPending) {
    return {
      name: '무료 플랜',
      badge: { label: '결제 확인 중', tone: 'info' },
      line: '결제가 확인되면 프로로 바뀌어요',
      alert: {
        tone: 'info',
        title: '결제 결과를 확인하고 있어요',
        body: '잠시 뒤 다시 확인해 주세요.',
      },
    }
  }
  switch (s.status) {
    case 'ACTIVE':
      return {
        name: `프로 ${CYCLE_NAME[cycle]}`,
        badge: { label: '진행 중', tone: 'success' },
        // 주기를 바꿨으면 다음 결제는 바꾼 주기의 금액이다(계약 `nextCycle`, #356 리뷰)
        line: `다음 결제일 ${end ?? '—'} · ${won(proCharge(nextCycleOf(s)))}원`,
      }
    case 'CANCEL_SCHEDULED':
      return {
        name: `프로 ${CYCLE_NAME[cycle]}`,
        badge: { label: '해지 예정', tone: 'warning' },
        line: `${end ?? '—'}까지 프로 · 그 뒤 무료로 바뀌어요`,
      }
    case 'PAYMENT_FAILED':
      return {
        name: '무료 플랜',
        badge: { label: '결제 실패', tone: 'danger' },
        line: '카드를 다시 등록하면 바로 프로로 돌아가요',
        action: { label: '카드 다시 등록', to: `/checkout?cycle=${cycle}` },
        alert: {
          tone: 'danger',
          title: '결제에 실패해 무료로 바뀌었어요',
          body: '등록한 카드로 갱신 결제를 하지 못했어요. 카드를 다시 등록해 주세요.',
        },
      }
    case 'NONE':
      return {
        name: '무료 플랜',
        badge: { label: '무료', tone: 'neutral' },
        line: free,
        action: { label: '프로 시작하기', to: '/pricing' },
      }
  }
}

/** 마이페이지 구독 (MY-06). 지금 플랜과 상태를 보여 준다. 결제 화면·요금제가 이리로 보낸다. */
export function Component() {
  const location = useLocation()
  const navigate = useNavigate()
  // 결제 화면이 409(이미 프로)를 받고 보낼 때 싣는 안내다. 처음 한 번만 읽는다
  const [notice] = useState(() => (location.state as { notice?: unknown } | null)?.notice)
  const queryClient = useQueryClient()
  const { data, error, isPending, isFetching, refetch } = useQuery(subscriptionQuery())
  const act = useSubscriptionAction()
  const [changeOpen, setChangeOpen] = useState(false)
  // 창을 연 채 구독이 바뀌어 더 바꿀 수 없게 되면(해지 예정이 됨, 바꾸기가 이미 저장됨) 창을 닫는다.
  // 열림을 남기면 다시 바꿀 수 있게 될 때 저절로 열린다(#357 리뷰)
  if (changeOpen && data && !canChangeCycle(data)) setChangeOpen(false)

  // 안내는 한 번만 보인다. 기록에 남기면 새로 고침·뒤로 가기 때마다 다시 뜬다(#356 리뷰)
  useEffect(() => {
    if (location.state !== null) navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 들어온 순간 한 번만
  }, [])

  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  let content: React.ReactNode
  if (isPending) content = <LoadingState />
  else if (error) content = <ErrorState problem={error} onRetry={() => void refetch()} />
  else {
    const view = viewOf(data)
    const pro = data.plan === 'PRO'
    const end =
      pro && data.currentPeriodEnd ? SHORT_DATE.format(new Date(data.currentPeriodEnd)) : null
    content = (
      <>
        {view.alert ? (
          <Alert
            tone={view.alert.tone}
            title={view.alert.title}
            live={false}
            // 결제가 확정되면 서버가 웹훅으로 바꾼다. 화면을 연 채로도 새로 받을 수 있게 한다(#356 리뷰)
            action={
              data.paymentPending ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={isFetching}
                  onClick={() => void refetch()}
                >
                  {isFetching ? '확인 중…' : '다시 확인'}
                </Button>
              ) : undefined
            }
          >
            {view.alert.body}
          </Alert>
        ) : null}
        <section
          aria-label="지금 플랜"
          className={
            pro
              ? 'bg-card border-primary rounded-[20px] border-2 p-6 md:p-8'
              : 'bg-card rounded-[20px] border p-6 md:p-8'
          }
        >
          <div className="flex flex-wrap items-center gap-4">
            <span className="bg-accent text-primary-text inline-flex size-12 shrink-0 items-center justify-center rounded-xl">
              <Icon name={pro ? PRO_PLAN.icon : 'code'} size={22} />
            </span>
            {/* 설명 칸이 200px보다 좁아지면 버튼이 다음 줄로 내려간다. 없으면 좁은 화면에서 글자 단위로 줄이 바뀐다(#357 리뷰) */}
            <div className="flex min-w-0 flex-1 basis-[200px] flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  id={PLAN_TITLE_ID}
                  tabIndex={-1}
                  className="text-foreground m-0 text-xl font-bold outline-none"
                >
                  {view.name}
                </h2>
                <Badge tone={view.badge.tone}>{view.badge.label}</Badge>
              </div>
              <p className="text-muted-foreground m-0 text-[15px]">{view.line}</p>
            </div>
            {view.action ? (
              <Button asChild>
                <Link to={view.action.to}>{view.action.label}</Link>
              </Button>
            ) : null}
            {end ? (
              <PlanActions
                subscription={data}
                end={end}
                act={act}
                changeOpen={changeOpen}
                setChangeOpen={setChangeOpen}
              />
            ) : null}
          </div>
          {end ? <NextCycleBand subscription={data} end={end} act={act} /> : null}
          {pro && data.currentPeriodEnd ? (
            <dl className="m-0 mt-6 border-t text-[15px]">
              <div className="grid grid-cols-[120px_1fr] gap-4 border-b py-3">
                <dt className="text-muted-foreground">결제 주기</dt>
                <dd className="text-foreground m-0">
                  {cycleText(data.cycle ? fromBillingCycle(data.cycle) : 'monthly')}
                </dd>
              </div>
              <div className="grid grid-cols-[120px_1fr] gap-4 border-b py-3">
                <dt className="text-muted-foreground">
                  {data.status === 'CANCEL_SCHEDULED' ? '프로 끝나는 날' : '다음 결제일'}
                </dt>
                <dd className="text-foreground m-0">{formatLongDate(data.currentPeriodEnd)}</dd>
              </div>
            </dl>
          ) : null}
          <ActionResult act={act} subscription={data} modalOpen={changeOpen} />
        </section>
        <section
          aria-labelledby="pro-features"
          className="bg-card rounded-[20px] border p-6 md:p-8"
        >
          <h2 id="pro-features" className="text-foreground m-0 text-lg font-bold">
            {pro ? '프로에서 쓰고 있는 것' : '프로로 올리면'}
          </h2>
          <ul className="m-0 mt-4 grid list-none gap-2.5 p-0 sm:grid-cols-2">
            {PRO_PLAN.features.map((f) => (
              <li key={f} className="text-body-foreground flex items-start gap-2.5 text-[15px]">
                <Icon
                  name="check"
                  size={18}
                  className={pro ? 'text-primary-text mt-0.5' : 'text-muted-foreground mt-0.5'}
                />
                {f}
              </li>
            ))}
          </ul>
        </section>
      </>
    )
  }

  return (
    <MyLayout title="구독" narrow>
      {typeof notice === 'string' ? <Alert tone="info" title={notice} /> : null}
      {content}
      <p className="text-muted-foreground m-0 text-[13px]">
        {TEST_PAYMENT_NOTICE} 환불은{' '}
        <a
          href="/refund"
          target="_blank"
          rel="noreferrer"
          className="text-primary-text font-semibold hover:underline"
        >
          환불 정책<span className="sr-only">(새 탭)</span>
        </a>
        을 따라요.
      </p>
    </MyLayout>
  )
}
