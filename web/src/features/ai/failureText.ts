import type { SubmissionAnalysis } from '@/api/types'

/**
 * 만들지 못한 이유별 안내 (AI-06, 계약 `failureReason`). 분석과 리뷰가 같은 값을 쓴다. 어느 이유든 다시 누르면 새로 만든다.
 * `what`은 조사까지 붙인 이름이다('분석을'·'리뷰를') — 받침에 따라 을/를이 달라서.
 */
export function failureText(
  reason: SubmissionAnalysis['failureReason'],
  what: '분석을' | '리뷰를',
): string {
  switch (reason) {
    case 'UNAVAILABLE':
      return `AI 서버가 응답하지 않아 ${what} 만들지 못했어요. 잠시 후 다시 시도해 주세요.`
    case 'RATE_LIMITED':
      return `AI 서버에 요청이 몰려 ${what} 만들지 못했어요. 잠시 후 다시 시도해 주세요.`
    case 'BUSY':
      return `지금 ${what} 기다리는 제출이 많아요. 잠시 후 다시 시도해 주세요.`
    default:
      return `${what} 만들지 못했어요. 다시 시도해 주세요.`
  }
}
