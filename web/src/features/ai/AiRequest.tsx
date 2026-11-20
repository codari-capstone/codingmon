import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { SubmissionAnalysis } from '@/api/types'
import { Button } from '@/components/ui/button'
import { problemCode, problemMessage } from '@/features/auth/problemCode'
import { AI_QUOTA_QUERY_KEY, aiQuotaQuery } from './analysisQuery'

/** 분석·리뷰가 같은 모양으로 주는 상태 (계약 `SubmissionAnalysis`·`SubmissionCodeReview`). */
interface AiResult {
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  failureReason: SubmissionAnalysis['failureReason']
  createdAt: string
  completedAt: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 한도가 풀릴 시각이 지났는데 아직 안 풀렸을 때(브라우저 시계가 서버보다 빠름) 다시 물을 간격 */
export const QUOTA_RECHECK_MS = 30_000

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
}: {
  /** 저장된 분석·리뷰. 요청한 적이 없으면 null */
  result: AiResult | null
  request: { isError: boolean; error: unknown; mutate: () => void }
  canRequest: boolean
  /** 남색 안내 카드 위인지. 글자색과 버튼 크기가 달라진다 */
  invite: boolean
  /** 처음 누르는 버튼 이름. 실패한 뒤에는 '다시 시도'다 */
  label: string
}) {
  const { data: quota, dataUpdatedAt, errorUpdatedAt } = useQuery(aiQuotaQuery())

  const abandonedToday =
    result?.status === 'FAILED' &&
    result.completedAt === null &&
    quota !== undefined &&
    Date.parse(result.createdAt) >= Date.parse(quota.resetsAt) - DAY_MS
  const outOfQuota = quota?.remaining === 0 && !abandonedToday
  const exhausted = quota
    ? `오늘 AI 분석·리뷰 ${quota.limit}회를 다 썼어요. ${RESETS_AT.format(new Date(quota.resetsAt))}에 다시 쓸 수 있어요.`
    : ''
  // 누른 뒤 한도 초과를 받았으면 그 안내를 alert로 읽힌다. 아래 줄은 live region이 아니라 소리 없이 바뀐다.
  // 오류 코드와 지금 한도를 함께 본다. 코드만 보면 한도가 풀린 뒤에도 '다 썼어요'가 남고(#298 리뷰),
  // remaining만 보면 네트워크 오류 뒤 다시 받은 0 때문에 다른 실패가 '다 썼어요'로 바뀐다(#272 리뷰)
  const limitError = request.isError && problemCode(request.error) === 'AI_DAILY_LIMIT_EXCEEDED'
  const limitHit = limitError && outOfQuota
  // 한도가 풀렸으면 지난 429는 더 알릴 것이 없다
  const showError = request.isError && !(limitError && !outOfQuota)

  // 한도가 풀리는 시각에 다시 받는다. 화면을 켜 둔 채 지나면 꺼진 버튼과 지난 시각 안내가 남는다(#272 리뷰).
  // 물을 때마다(받았든 실패했든) 다시 건다. 시계가 빨라 같은 resetsAt을 받아도, 다시 받기가 실패해도
  // 다음 확인이 걸린다(#298 리뷰)
  const queryClient = useQueryClient()
  const resetsAt = quota?.resetsAt
  useEffect(() => {
    if (!resetsAt) return
    const reset = Date.parse(resetsAt)
    // 아직 안 지났으면 그 시각에. 지난 뒤 한 번도 묻지 않았으면 바로. 지난 뒤 물었는데 그대로이거나
    // 실패했으면 서버가 아직이다(시계 차이·일시 장애) — 간격을 두고 다시 묻는다
    const lastAsked = Math.max(dataUpdatedAt, errorUpdatedAt)
    const delay = reset > Date.now() ? reset - Date.now() : lastAsked < reset ? 0 : QUOTA_RECHECK_MS
    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: AI_QUOTA_QUERY_KEY }),
      delay,
    )
    return () => clearTimeout(timer)
  }, [resetsAt, dataUpdatedAt, errorUpdatedAt, queryClient])

  return (
    <>
      {showError ? (
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
          {/* 분석과 리뷰가 함께 쓰는 한도라 어느 패널이든 같은 이름으로 부른다(#273 리뷰) */}
          {outOfQuota
            ? exhausted
            : quota.limit === null
              ? '관리자는 AI 분석·리뷰를 한도 없이 써요' // #343. remaining도 null이라 outOfQuota가 되지 않는다
              : `오늘 남은 AI 분석·리뷰 ${quota.remaining} / ${quota.limit}회`}
        </p>
      ) : null}
    </>
  )
}
