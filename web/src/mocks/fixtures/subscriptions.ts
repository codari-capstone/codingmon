import type { BillingCycle, Subscription } from '@/api/types'
import { addMonthsKst } from '@/features/subscription/subscriptionQuery'

/** 목의 구독. 사용자마다 처음에는 구독한 적 없음(`NONE`)이다 */
const subscriptions = new Map<number, Subscription>()

/** 구독이 없는 사용자의 응답. 고객 ID는 늘 준다(계약 `customerId`) */
export const freeSubscription = (userId: number): Subscription => ({
  plan: 'FREE',
  status: 'NONE',
  cycle: null,
  nextCycle: null,
  currentPeriodEnd: null,
  customerId: `cus-mock-${userId}`,
  paymentPending: false,
})

export function subscriptionFor(userId: number): Subscription {
  return subscriptions.get(userId) ?? freeSubscription(userId)
}

/** 결제가 된 것으로 보고 구독을 시작한다. 기간은 지금부터 한 달(연간은 1년)이다 */
export function startMockSubscription(userId: number, cycle: BillingCycle): Subscription {
  // 결제 화면이 고지한 다음 결제일과 같은 계산이다(월말을 넘지 않는다)
  const end = addMonthsKst(new Date(), cycle === 'MONTHLY' ? 1 : 12)
  const started: Subscription = {
    ...freeSubscription(userId),
    plan: 'PRO',
    status: 'ACTIVE',
    cycle,
    currentPeriodEnd: end.toISOString(),
  }
  subscriptions.set(userId, started)
  return started
}

/** 테스트 사이에 구독이 새지 않게 비운다 */
export function resetSubscriptions(): void {
  subscriptions.clear()
}
