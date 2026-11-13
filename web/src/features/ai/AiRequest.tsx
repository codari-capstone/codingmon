import { useQuery } from '@tanstack/react-query'

import type { SubmissionAnalysis } from '@/api/types'
import { Button } from '@/components/ui/button'
import { problemMessage } from '@/features/auth/problemCode'
import { aiQuotaQuery } from './analysisQuery'

/** 분석·리뷰가 같은 모양으로 주는 상태 (계약 `SubmissionAnalysis`·`SubmissionCodeReview`). */
interface AiResult {
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  failureReason: SubmissionAnalysis['failureReason']
  createdAt: string
  completedAt: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

const RESETS_AT = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/**
 * 요청 오류 · [AI 분석]/[AI 리뷰]·[다시 시도] 버튼 · 오늘 남은 횟수 (AI-01·06). 분석과 리뷰는 하루 한도를 함께 쓴다(계약 `AiQuota`).
 *
 * 한도를 다 썼으면 새로 만들 수 없다(429). 예외: 서버가 처리 중에 내려가 시간이 지나 FAILED가 된 결과는
 * 이미 1회로 셌고 다시 요청할 수 있다 — 이 경우만 completedAt이 null이다(계약 `AiQuota`·`completedAt`).
 * 단 오늘(UTC) 만든 것만이다. 서버는 오늘 만든 결과만 세고, 어제 것을 다시 요청하면 새 1회로 센다(#272 리뷰).
 */
export function AiRequest({
  result,
  request,
  canRequest,
  invite,
  label,
  quotaLabel,
}: {
  /** 저장된 분석·리뷰. 요청한 적이 없으면 null */
  result: AiResult | null
  request: { isError: boolean; error: unknown; mutate: () => void }
  canRequest: boolean
  /** 남색 안내 카드 위인지. 글자색과 버튼 크기가 달라진다 */
  invite: boolean
  /** 처음 누르는 버튼 이름. 실패한 뒤에는 '다시 시도'다 */
  label: string
  /** 남은 횟수 줄의 이름 ('오늘 남은 {quotaLabel} N / 20회') */
  quotaLabel: string
}) {
  const quota = useQuery(aiQuotaQuery()).data

  const abandonedToday =
    result?.status === 'FAILED' &&
    result.completedAt === null &&
    quota !== undefined &&
    Date.parse(result.createdAt) >= Date.parse(quota.resetsAt) - DAY_MS
  const outOfQuota = quota?.remaining === 0 && !abandonedToday
  const exhausted = quota
    ? `오늘 AI 분석·리뷰 ${quota.limit}회를 다 썼어요. ${RESETS_AT.format(new Date(quota.resetsAt))}에 다시 쓸 수 있어요.`
    : ''
  // 누른 뒤 한도 초과를 받았으면 그 안내를 alert로 읽힌다. 아래 줄은 live region이 아니라 소리 없이 바뀐다
  const limitHit = request.isError && outOfQuota

  return (
    <>
      {request.isError ? (
        <p
          role="alert"
          className={invite ? 'text-inverse-foreground text-sm' : 'text-destructive-text text-sm'}
        >
          {limitHit ? exhausted : problemMessage(request.error)}
        </p>
      ) : null}
      {canRequest ? (
        <Button
          type="button"
          size={invite ? 'lg' : 'md'}
          fullWidth={invite}
          className="min-h-11 self-start"
          disabled={outOfQuota}
          onClick={() => request.mutate()}
        >
          {result === null ? label : '다시 시도'}
        </Button>
      ) : null}
      {canRequest && quota && !limitHit ? (
        <p className={invite ? 'text-inverse-muted text-sm' : 'text-muted-foreground text-sm'}>
          {outOfQuota ? exhausted : `오늘 남은 ${quotaLabel} ${quota.remaining} / ${quota.limit}회`}
        </p>
      ) : null}
    </>
  )
}
