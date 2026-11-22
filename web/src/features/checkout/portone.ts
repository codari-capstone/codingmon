import * as PortOne from '@portone/browser-sdk/v2'

/** 카드 등록 결과. `undefined`는 모바일에서 카드 등록 페이지로 넘어갔다는 뜻이다(돌아오면 `readBillingRedirect`) */
export type BillingKeyResult =
  { billingKey: string } | { code: string; message: string } | undefined

/** 모바일 카드 등록이 끝나면 돌아오는 자리 (PAY-01) */
export const BILLING_RETURN_PATH = '/checkout?result=billing'

const FALLBACK = '카드를 등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.'

/**
 * 포트원 카드 등록 창을 띄운다 (PAY-01). 토스페이먼츠는 PC에서 창(iframe), 모바일에서 페이지 이동이다.
 * 목 모드(`dev:mock`)는 창 없이 가짜 빌링키를 돌려준다 — 포트원 상점이 없어도 화면을 끝까지 볼 수 있게.
 * 창을 닫거나 등록이 실패하면 `code`가 있는 값이다. 어느 경우든 결제는 되지 않았다.
 */
export async function requestBillingKey(customerId: string): Promise<BillingKeyResult> {
  if (import.meta.env.MODE === 'mock') return { billingKey: 'mock-billing-key' }
  const storeId = import.meta.env.VITE_PORTONE_STORE_ID
  const channelKey = import.meta.env.VITE_PORTONE_CHANNEL_KEY
  if (!storeId || !channelKey) {
    return { code: 'NOT_CONFIGURED', message: '결제 설정이 아직 준비되지 않았어요.' }
  }
  try {
    const response = await PortOne.requestIssueBillingKey({
      storeId,
      channelKey,
      billingKeyMethod: 'CARD',
      customer: { customerId },
      redirectUrl: `${window.location.origin}${BILLING_RETURN_PATH}`,
    })
    if (response === undefined) return undefined
    if (response.code !== undefined)
      return { code: response.code, message: response.message ?? FALLBACK }
    return { billingKey: response.billingKey }
  } catch (error) {
    // SDK를 받지 못했거나 요청이 잘못된 경우다. 결제 전이라 화면에 그대로 둔다
    return { code: 'SDK_ERROR', message: error instanceof Error ? error.message : FALLBACK }
  }
}

/**
 * 모바일 카드 등록에서 돌아온 주소를 읽는다. `result=billing`이 아니면 null.
 * shortcut: 쿼리 이름(billingKey·code·message)은 SDK 반환값과 같은 이름으로 짐작했다. 포트원 테스트 채널이 생기면 실제 모바일 리다이렉트로 확인한다.
 */
export function readBillingRedirect(params: URLSearchParams): BillingKeyResult | null {
  if (params.get('result') !== 'billing') return null
  const code = params.get('code')
  // 주소의 message는 누구나 링크에 넣을 수 있어 그대로 보이지 않고 정해 둔 문구를 쓴다(#356 리뷰)
  if (code) return { code, message: FALLBACK }
  const billingKey = params.get('billingKey')
  return billingKey ? { billingKey } : { code: 'NO_BILLING_KEY', message: FALLBACK }
}
