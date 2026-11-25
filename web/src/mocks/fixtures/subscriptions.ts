import type { BillingCycle, Subscription } from '@/api/types'
import { addMonthsKst } from '@/features/subscription/subscriptionQuery'

/** 목의 구독. 사용자마다 처음에는 구독한 적 없음(`NONE`)이다 */
const subscriptions = new Map<number, Subscription>()
/** 사용자별 이번 구독을 시작한 시각(ISO). 끝나면(탈퇴) 지운다 */
const startedAt = new Map<number, string>()

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
  startedAt.set(userId, new Date().toISOString())
  return started
}

/** 이번 구독을 시작한 시각. 프로 AI 한도는 이 뒤에 쓴 것만 센다(계약 `AiQuota`) */
export const proStartedAt = (userId: number): string | undefined => startedAt.get(userId)

/**
 * 해지·해지 취소·주기 바꾸기 (MY-06). 계약대로 할 수 없는 상태면 null(→ 409 `SUBSCRIPTION_NOT_ACTIVE`).
 * 해지하면 바꿔 둔 주기도 취소하고, 같은 상태로 다시 보내면 그대로다.
 */
export function changeMockSubscription(
  userId: number,
  action: { kind: 'cancel' } | { kind: 'resume' } | { kind: 'cycle'; cycle: BillingCycle },
): Subscription | null {
  const s = subscriptionFor(userId)
  if (s.plan !== 'PRO') return null
  let next: Subscription
  if (action.kind === 'cancel') next = { ...s, status: 'CANCEL_SCHEDULED', nextCycle: null }
  else if (action.kind === 'resume') next = { ...s, status: 'ACTIVE' }
  else if (s.status !== 'ACTIVE') return null
  else next = { ...s, nextCycle: action.cycle === s.cycle ? null : action.cycle }
  subscriptions.set(userId, next)
  return next
}

/** 탈퇴하면 구독도 끝난다(MY-04) */
export function removeMockSubscription(userId: number): void {
  subscriptions.delete(userId)
  startedAt.delete(userId)
}

/** 테스트 사이에 구독이 새지 않게 비운다 */
export function resetSubscriptions(): void {
  subscriptions.clear()
  startedAt.clear()
}
