import type { Subscription } from '@/api/types'
import type { Cycle } from '@/features/pricing/plans'

/** 결제 결과 (PAY-02). 409(이미 프로)와 401은 결과 카드가 아니라 다른 화면으로 보낸다 */
export type CheckoutOutcome =
  | { kind: 'success'; subscription: Subscription; cycle: Cycle }
  /** 503 `PAYMENT_PROVIDER_UNAVAILABLE`. 결제 전에 끊겨 결제되지 않았다 */
  | { kind: 'provider' }
  /** 503 `PAYMENT_UNAVAILABLE` 또는 응답을 받지 못함. 결제됐는지 모른다 */
  | { kind: 'unknown' }
  /** 그 밖의 실패. `reason`은 서버 `detail`(402면 포트원이 준 실패 이유) */
  | { kind: 'failed'; reason: string | null }

/** 결제 요청이 던진 값을 결과로 가른다. `already`는 409, `signedOut`은 401이다 */
export function classifyFailure(error: unknown): CheckoutOutcome | 'already' | 'signedOut' {
  const body = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {}
  const status = typeof body.status === 'number' ? body.status : undefined
  // fail()은 늘 status를 싣는다. 없으면 응답을 받지 못한 것(연결 끊김)이라 결제됐는지 모른다
  if (status === undefined) return { kind: 'unknown' }
  if (status === 401) return 'signedOut'
  if (status === 409) return 'already'
  // 결제 전 1단계에서 끊긴 것만 결제되지 않았다고 확신할 수 있다
  if (status === 503 && body.code === 'PAYMENT_PROVIDER_UNAVAILABLE') return { kind: 'provider' }
  // 그 밖의 서버 오류는 결제한 뒤 반영하다 났을 수 있다(계약 4·5단계). 결제됐는지 모르는 것으로 본다(#356 리뷰)
  if (status >= 500) return { kind: 'unknown' }
  return { kind: 'failed', reason: typeof body.detail === 'string' ? body.detail : null }
}
