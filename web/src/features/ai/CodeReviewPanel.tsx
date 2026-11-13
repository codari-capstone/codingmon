import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { SubmissionCodeReview } from '@/api/types'
import codingmonFace from '@/assets/brand/codingmon_face.png'
import studyingScene from '@/assets/scenes/studying.png'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Badge } from '@/components/ui/badge'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { isDeadEnd } from '@/features/result/resultQuery'
import { cn } from '@/lib/utils'
import { AiRequest } from './AiRequest'
import { codeReviewQuery, useRequestCodeReview } from './codeReviewQuery'
import { failureText } from './failureText'

// 모델이 만든 문장이라 글자 그대로 보여 준다(계약). 긴 영단어·코드 조각이 칸을 넘지 않게 끊는다
const PROSE =
  'text-body-foreground text-[15px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]'

function statusText(working: boolean, review: SubmissionCodeReview | null): string {
  if (working) return 'AI가 코드를 리뷰하고 있어요…'
  if (review === null) return ''
  if (review.status === 'FAILED') return failureText(review.failureReason, '리뷰를')
  // AI-06. 정답 코드가 섞여 결과를 숨긴 리뷰다(계약). 다시 요청해도 새로 만들지 않는다.
  if (review.blocked)
    return '이 제출은 AI 리뷰를 보여 줄 수 없어요. 채점 결과는 그대로 볼 수 있어요.'
  return '리뷰를 마쳤어요.'
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className="text-muted-foreground text-sm font-semibold">{title}</h3>
      {children}
    </div>
  )
}

/** 리뷰 내용 (AI-05): 요약 · 복잡도 · 개선점 · 다음에 배울 개념. */
function Review({ review }: { review: SubmissionCodeReview }) {
  const { complexity } = review
  return (
    <>
      {review.summary !== null ? (
        <p className="bg-muted text-foreground rounded-[16px] p-5 text-lg leading-normal font-semibold whitespace-pre-wrap [overflow-wrap:anywhere]">
          {review.summary}
        </p>
      ) : null}

      {complexity !== null ? (
        <Section title="복잡도">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[15px]">
            <dt className="text-muted-foreground">시간</dt>
            <dd className="text-foreground font-mono font-semibold">{complexity.time}</dd>
            <dt className="text-muted-foreground">공간</dt>
            <dd className="text-foreground font-mono font-semibold">{complexity.space}</dd>
            {/* 문제에 적힌 값이 아니라 AI의 어림이다(계약) */}
            <dt className="text-muted-foreground">의도한 시간(추정)</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="text-foreground font-mono font-semibold">
                {complexity.intendedTime}
              </span>
              <Badge tone={complexity.meetsIntended ? 'success' : 'warning'}>
                {complexity.meetsIntended ? '의도한 만큼 빨라요' : '더 줄일 수 있어요'}
              </Badge>
            </dd>
          </dl>
          <p className={PROSE}>{complexity.comparison}</p>
          <p className={cn(PROSE, 'text-muted-foreground text-sm')}>{complexity.basis}</p>
        </Section>
      ) : null}

      {review.improvements.length > 0 ? (
        <Section title="개선점">
          <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5">
            {review.improvements.map((text, index) => (
              <li key={index} className={PROSE}>
                {text}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {review.nextConcepts.length > 0 ? (
        <Section title="다음에 배울 개념">
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {review.nextConcepts.map((concept, index) => (
              <li key={index} className="flex flex-col gap-1.5 rounded-[14px] border px-4 py-3.5">
                <Badge tone="brand" className="self-start">
                  {concept.name}
                </Badge>
                <p className={PROSE}>{concept.reason}</p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  )
}

/**
 * AI 코드 리뷰 (AI-05·06). 채점이 끝난 정답에서만 그린다(결과 화면이 고른다).
 * 상태·요청·한도 처리는 AnalysisPanel과 같다 — 그 주석이 이유를 적어 두었다.
 */
export function CodeReviewPanel({ submissionId }: { submissionId: number }) {
  const queryClient = useQueryClient()
  const { data, isPending, error, refetch } = useQuery(codeReviewQuery(submissionId))
  const request = useRequestCodeReview(submissionId)

  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  const deadEnd = isDeadEnd(error, data !== undefined)
  const loaded = !deadEnd && !isPending && data !== undefined
  const working = request.isPending || data?.status === 'PENDING'
  const done = loaded && !working && data?.status === 'COMPLETED' && !data.blocked
  const canRequest = loaded && !working && (data === null || data.status === 'FAILED')
  const invite = loaded && data === null && !working

  return (
    // 안내 카드와 리뷰 패널이 같은 section인 이유는 AnalysisPanel 주석(live region)
    <section
      aria-labelledby="review-heading"
      className={
        invite
          ? 'bg-inverse text-inverse-foreground flex min-w-0 flex-col gap-3 rounded-lg p-7 dark:border'
          : 'bg-card flex min-w-0 flex-col gap-5 rounded-lg border p-6 sm:p-7'
      }
    >
      <p
        role="status"
        className={done || invite || !loaded ? 'sr-only' : 'text-muted-foreground text-sm'}
      >
        {loaded ? statusText(working, data) : ''}
      </p>

      {invite ? (
        <>
          <img
            src={studyingScene}
            alt=""
            width={180}
            height={140}
            className="-order-1 mx-auto block h-auto max-w-full"
          />
          <h2 id="review-heading" className="text-eyebrow text-inverse-accent mt-2">
            AI 리뷰
          </h2>
          <p className="text-[22px] leading-[1.35] font-bold tracking-[-0.02em]">
            더 나은 풀이가 있는지 볼까요?
          </p>
          <p className="text-inverse-muted text-[15px] leading-[1.65]">
            시간·공간 복잡도와 고칠 점, 다음에 배울 개념을 AI가 짚어 줘요. 고친 코드는 주지 않아요.
          </p>
        </>
      ) : (
        <div className="-order-1 flex items-center gap-3">
          <span className="bg-accent inline-flex size-11 flex-none overflow-hidden rounded-full">
            <img src={codingmonFace} alt="" width={44} height={44} className="block" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="review-heading" className="text-foreground text-lg font-bold">
              AI 리뷰
            </h2>
            <p className="text-muted-foreground mt-0.5 text-[13px]">
              맞힌 코드를 더 빠르고 읽기 쉽게 다듬을 곳을 짚어요.
            </p>
          </div>
          {done ? <Badge tone="success">리뷰 완료</Badge> : null}
        </div>
      )}

      {deadEnd ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}
      {!deadEnd && !loaded ? <ListSkeleton rows={2} /> : null}
      {done ? <Review review={data} /> : null}
      <AiRequest
        result={data ?? null}
        request={request}
        canRequest={canRequest}
        invite={invite}
        label="AI 리뷰"
        quotaLabel="AI 분석·리뷰"
      />
    </section>
  )
}
