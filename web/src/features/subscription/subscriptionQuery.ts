import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { BillingCycle, Subscription } from '@/api/types'
import type { Cycle } from '@/features/pricing/plans'

/** 마이페이지 구독 (MY-06). 결제 화면·요금제가 이리로 보낸다 */
export const SUBSCRIPTION_PATH = '/me/subscription'

/** 사용자별 응답이라 `adoptSession`이 로그인할 때 지운다(session.ts) */
export const SUBSCRIPTION_KEY = ['subscription'] as const

/** 프로를 쓰는 중이거나 첫 결제를 확인하는 중이면 결제 화면이 아니라 마이페이지 구독이다 (PAY-01, PRICE-03) */
export const belongsToSubscription = (s: Subscription) => s.plan === 'PRO' || s.paymentPending

/** 화면은 'monthly'·'yearly'(요금제 토글과 같은 값), 계약은 'MONTHLY'·'YEARLY'다 */
export const toBillingCycle = (cycle: Cycle): BillingCycle =>
  cycle === 'monthly' ? 'MONTHLY' : 'YEARLY'

export const fromBillingCycle = (cycle: BillingCycle): Cycle =>
  cycle === 'MONTHLY' ? 'monthly' : 'yearly'

/**
 * 내 구독. 구독한 적이 없어도 `plan: FREE`, `status: NONE`이고 카드 등록에 쓸 `customerId`는 늘 있다(계약).
 * 결제 화면·요금제·마이페이지가 같은 키를 본다. 결제 결과가 다른 탭에서 바뀔 수 있어 매번 새로 받는다.
 */
export function subscriptionQuery() {
  return queryOptions({
    queryKey: SUBSCRIPTION_KEY,
    queryFn: async (): Promise<Subscription> => {
      const result = await api.GET('/api/users/me/subscription')
      if (result.data === undefined) fail(result)
      return result.data
    },
    staleTime: 0,
  })
}

/** 프로 구독 시작 (PAY-01). 금액은 서버가 `cycle`로 정한다. `agreed`는 동의 체크 2개를 모두 했다는 뜻이다 */
export async function startSubscription(input: {
  billingKey: string
  cycle: Cycle
}): Promise<Subscription> {
  const result = await api.POST('/api/users/me/subscription', {
    body: { billingKey: input.billingKey, cycle: toBillingCycle(input.cycle), agreed: true },
  })
  if (result.data === undefined) fail(result)
  return result.data
}

/** 한국 시각은 서머타임이 없어 늘 UTC+9다 */
const KST_OFFSET_MS = 9 * 3_600_000

/**
 * 한국 날짜로 개월 수를 더한 시각. 서버처럼 달의 끝을 넘지 않는다(1월 31일 + 1개월 = 2월 28일).
 * 브라우저 시간대와 관계없이 한국 날짜로 센다 — 서버가 기간을 한국 날짜로 잡기 때문이다.
 * 결제 전 고지의 '다음 결제일'과 목의 구독 기간에 쓴다. 결제 뒤에는 서버의 `currentPeriodEnd`를 쓴다.
 */
export function addMonthsKst(from: Date, months: number): Date {
  // 한국 벽시계를 UTC 칸에 옮겨 놓고 달력 계산을 한다
  const kst = new Date(from.getTime() + KST_OFFSET_MS)
  const year = kst.getUTCFullYear()
  const month = kst.getUTCMonth() + months
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  kst.setUTCFullYear(year, month, Math.min(kst.getUTCDate(), last))
  return new Date(kst.getTime() - KST_OFFSET_MS)
}

const LONG_DATE = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Asia/Seoul',
})

/** '2026년 12월 22일'. 결제일은 한국 시각으로 보여 준다 */
export const formatLongDate = (date: Date | string) => LONG_DATE.format(new Date(date))
