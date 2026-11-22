import type { Cycle } from '@/features/pricing/plans'

/** 모바일 카드 등록 페이지로 넘어가는 동안 들고 있을 결제 화면 값 (PAY-01) */
export interface CheckoutDraft {
  cycle: Cycle
  agreeTerms: boolean
  agreeAutopay: boolean
}

const KEY = 'codingmon:checkout-draft'

// 저장소가 막힌 브라우저(사생활 보호 모드 등)에서도 결제 화면은 돌아야 해서 실패를 삼킨다
export function saveDraft(draft: CheckoutDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    /* 저장하지 못하면 돌아와서 다시 고른다 */
  }
}

/** 저장한 값을 읽기만 한다. 지우기는 clearDraft — 렌더 중에 불러도 두 번 읽어 같은 값이다 */
export function readDraft(): CheckoutDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw === null) return null
    const v = JSON.parse(raw) as Partial<CheckoutDraft>
    if (v.cycle !== 'monthly' && v.cycle !== 'yearly') return null
    return {
      cycle: v.cycle,
      agreeTerms: v.agreeTerms === true,
      agreeAutopay: v.agreeAutopay === true,
    }
  } catch {
    return null
  }
}

export function clearDraft(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    /* 지울 것도 못 읽었다 */
  }
}
