import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { Accordion } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { useAuth } from '@/features/auth/useAuth'
import { StartButton } from '@/features/landing/StartButton'
import {
  belongsToSubscription,
  SUBSCRIPTION_PATH,
  subscriptionQuery,
} from '@/features/subscription/subscriptionQuery'
import { cn } from '@/lib/utils'
import { CycleToggle } from './CycleToggle'
import { COMPARE, COMPARE_NOTE, FAQ, PLANS, won, type Cycle, type Plan } from './plans'

// 랜딩과 같은 구역 폭·제목 크기다(LandingPage)
const SECTION = 'max-w-content mx-auto box-content px-6'
const H2 =
  'm-0 text-[28px] leading-[1.25] font-bold tracking-[-0.025em] text-foreground lg:text-[40px]'
const EYEBROW = 'text-primary-text m-0 text-sm font-semibold tracking-[.02em]'

/** 요금제 (PRICE-01~03). 로그인 여부와 관계없이 보여 주고, 시작 버튼만 바뀐다. */
export function Component() {
  const { isAuthenticated, isLoading } = useAuth()
  // 세션을 아직 모르면 undefined. 로그인한 사람이 새로 고침한 순간 가입 버튼을 누르지 않게 한다(랜딩과 같다)
  const signedIn = isLoading ? undefined : isAuthenticated
  const [cycle, setCycle] = useState<Cycle>('monthly')

  return (
    // 고정 문구뿐이라 낱말 중간에서 줄을 바꾸지 않게 한 번에 건다(390px에서 '쓰세 / 요')
    <div className="break-keep">
      <section className={cn(SECTION, 'flex flex-col items-center gap-10 pt-16 lg:pt-24')}>
        <div className="flex flex-col items-center gap-4 text-center">
          <p className={EYEBROW}>요금제</p>
          <h1 className="text-foreground m-0 text-[36px] leading-[1.2] font-bold tracking-[-0.03em] md:text-[48px]">
            필요한 만큼만 골라 쓰세요
          </h1>
          <p className="text-muted-foreground m-0 max-w-[560px] text-[17px] leading-[1.7]">
            문제 풀이와 채점은 언제나 무료예요. AI 오답 분석과 힌트를 더 많이 쓰고 싶을 때 프로로
            올려 보세요.
          </p>
        </div>

        <CycleToggle cycle={cycle} onChange={setCycle} />

        <div className="flex w-full flex-col items-center gap-4">
          <ul className="m-0 grid w-full max-w-[800px] list-none grid-cols-1 gap-5 p-0 md:grid-cols-2">
            {PLANS.map((plan) => (
              <li key={plan.id} className="flex">
                <PlanCard plan={plan} cycle={cycle} signedIn={signedIn} />
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground m-0 text-center text-sm leading-[1.6]">
            모든 가격은 부가세 포함이에요. 유료 플랜은 언제든 해지할 수 있고, 남은 기간까지는 그대로
            쓸 수 있어요.
          </p>
        </div>
      </section>

      <section className={cn(SECTION, 'flex flex-col gap-8 pt-24 lg:pt-[120px]')}>
        <div className="flex flex-col gap-3.5">
          <p className={EYEBROW}>기능 비교</p>
          <h2 className={H2}>플랜별로 한눈에 비교해 보세요</h2>
        </div>
        <CompareTable />
      </section>

      <section
        className={cn(
          SECTION,
          'grid items-start gap-10 pt-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16 lg:pt-[120px]',
        )}
      >
        <div className="flex flex-col gap-3.5">
          <p className={EYEBROW}>자주 묻는 질문</p>
          <h2 className={H2}>결제가 궁금해요</h2>
        </div>
        <Accordion items={FAQ} defaultOpen={['free']} />
      </section>

      <section className={cn(SECTION, 'pt-24 pb-20 lg:pt-[120px]')}>
        <div className="bg-inverse flex flex-col items-start justify-between gap-8 rounded-[40px] p-8 lg:flex-row lg:items-center lg:p-[72px]">
          <div className="flex flex-col gap-4">
            <h2 className="text-inverse-foreground m-0 text-[28px] leading-[1.25] font-bold tracking-[-0.025em] lg:text-[40px]">
              일단 무료로 풀어 보고 정하세요
            </h2>
            <p className="text-inverse-muted m-0 text-lg leading-[1.7]">
              문제 풀이와 채점은 언제나 무료예요.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <StartButton signedIn={signedIn} />
            {signedIn !== false ? null : (
              <Button asChild size="lg" variant="glass">
                <Link to="/problems">문제 둘러보기</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </div>
  )
}

function PlanCard({
  plan,
  cycle,
  signedIn,
}: {
  plan: Plan
  cycle: Cycle
  signedIn: boolean | undefined
}) {
  const pro = plan.id === 'pro'
  const price = plan.price[cycle]
  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={cn(
        // 테두리는 두 카드 모두 1px. 프로의 굵은 선은 자리를 차지하지 않는 ring으로 더한다 — border-2면 안쪽이 1px 밀려 두 카드가 어긋난다
        'bg-card relative flex w-full flex-col gap-6 rounded-[20px] border p-8',
        pro && 'border-primary ring-primary shadow-card ring-1',
      )}
    >
      {pro ? (
        <span className="bg-primary text-primary-foreground absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold">
          <Icon name="star" size={12} />
          추천
        </span>
      ) : null}

      <div className="flex flex-col gap-4">
        <span className="bg-accent text-primary-text inline-flex size-10 items-center justify-center rounded-xl">
          <Icon name={plan.icon} size={20} />
        </span>
        <div className="flex flex-col gap-1">
          <h3 id={`plan-${plan.id}`} className="text-foreground m-0 text-xl font-bold">
            {plan.name}
          </h3>
          <p className="text-muted-foreground m-0 text-sm">{plan.audience}</p>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-foreground m-0 flex items-baseline gap-1">
            {price > 0 ? <span className="text-base font-semibold">월</span> : null}
            <span className="text-[40px] leading-none font-bold tracking-[-0.03em] tabular-nums">
              {won(price)}
            </span>
            <span className="text-base font-semibold">원</span>
          </p>
          <p className="text-muted-foreground m-0 text-sm">{plan.note[cycle]}</p>
        </div>
        {pro ? (
          <ProStart signedIn={signedIn} cycle={cycle} />
        ) : (
          <StartButton signedIn={signedIn} variant="secondary" fullWidth />
        )}
      </div>

      <div className="flex flex-col gap-3 border-t pt-6">
        {plan.lead ? (
          <p className="text-foreground m-0 text-sm font-semibold">{plan.lead}</p>
        ) : null}
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {plan.features.map((f) => (
            <li key={f} className="text-body-foreground flex items-start gap-2.5 text-[15px]">
              <Icon name="check" size={18} className="text-success-text mt-0.5" />
              {f}
            </li>
          ))}
        </ul>
      </div>
    </article>
  )
}

/**
 * 프로 버튼 (PRICE-03). 비로그인은 로그인 화면(돌아올 곳은 이 화면). 로그인한 사용자는 무료·결제 실패면
 * 고른 주기로 결제 화면, 프로를 쓰는 중이거나 첫 결제를 확인하는 중이면 마이페이지 구독이다.
 * 구독을 읽지 못하면 결제 화면으로 보낸다 — 결제 화면이 다시 확인하고 맞는 곳으로 보낸다.
 */
function ProStart({ signedIn, cycle }: { signedIn: boolean | undefined; cycle: Cycle }) {
  const { data, isPending, error } = useQuery({
    ...subscriptionQuery(),
    enabled: signedIn === true,
  })
  // 세션이 끊겼으면 캐시에서 지워 헤더와 버튼을 비로그인으로 바꾼다(결제 화면과 같은 처리, #356 리뷰)
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])
  if (signedIn === undefined || (signedIn && isPending)) {
    return (
      <Button size="lg" fullWidth aria-hidden tabIndex={-1} className="invisible">
        프로 시작하기
      </Button>
    )
  }
  if (signedIn) {
    const subscribed = data !== undefined && belongsToSubscription(data)
    return (
      <Button asChild size="lg" fullWidth>
        {subscribed ? (
          <Link to={SUBSCRIPTION_PATH}>내 구독 보기</Link>
        ) : (
          <Link to={`/checkout?cycle=${cycle}`}>프로 시작하기</Link>
        )}
      </Button>
    )
  }
  return (
    <Button asChild size="lg" fullWidth>
      <Link to="/login" state={{ from: '/pricing' }}>
        프로 시작하기
      </Link>
    </Button>
  )
}

function CompareTable() {
  return (
    // 좁은 화면에서는 표 상자 안에서만 가로로 민다(#331)
    <div className="bg-card scroll-fade-x overflow-x-auto rounded-[20px] border px-6 py-2">
      <table className="w-full min-w-[520px] border-collapse text-[15px]">
        <thead>
          <tr className="border-b">
            <th scope="col" className="text-muted-foreground py-4 text-left text-sm font-semibold">
              기능
            </th>
            {PLANS.map((p) => (
              <th
                key={p.id}
                scope="col"
                className={cn(
                  'w-[30%] py-4 text-center font-bold',
                  p.id === 'pro' ? 'text-primary-text' : 'text-foreground',
                )}
              >
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        {COMPARE.map((g) => (
          <tbody key={g.group}>
            <tr className="border-b">
              <th
                scope="rowgroup"
                colSpan={PLANS.length + 1}
                className="text-muted-foreground pt-6 pb-3 text-left text-[13px] font-semibold"
              >
                {g.group}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.label} className="border-b last:border-b-0">
                <th scope="row" className="text-body-foreground py-4 text-left font-normal">
                  {r.label}
                </th>
                {r.cells.map((c, i) => (
                  <td key={PLANS[i].id} className="text-body-foreground py-4 text-center">
                    {c === true ? (
                      <Icon
                        name="check"
                        size={18}
                        label="포함"
                        className="text-primary-text inline-block"
                      />
                    ) : (
                      c
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
      <p className="text-muted-foreground m-0 border-t py-4 text-[13px]">{COMPARE_NOTE}</p>
    </div>
  )
}
