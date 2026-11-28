import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { SubmissionCodeReview } from '@/api/types'
import codingmonFace from '@/assets/brand/codingmon_face.png'
import studyingScene from '@/assets/scenes/studying.png'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { LoadingState } from '@/components/LoadingState'
import { Badge } from '@/components/ui/badge'
import { Tooltip } from '@/components/ui/tooltip'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { isDeadEnd } from '@/features/result/resultQuery'
import { AiRequest } from './AiRequest'
import { codeReviewQuery, useRequestCodeReview } from './codeReviewQuery'
import { failureText } from './failureText'

// 모델이 만든 문장이라 글자 그대로 보여 준다(계약). 긴 영단어·코드 조각이 칸을 넘지 않게 끊는다
const VALUE = 'text-foreground min-w-0 text-2xl font-bold [overflow-wrap:anywhere]'
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

// 섹션 제목 색. 이 화면에서만 써서 토큰을 만들지 않고 두 토큰을 섞는다(다크는 토큰을 따라간다)
const SECTION_TITLE =
  'text-base font-semibold text-[color-mix(in_srgb,var(--primary-text)_45%,var(--muted-foreground))]'

function Section({
  title,
  titleClassName = SECTION_TITLE,
  children,
}: {
  title: string
  titleClassName?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <h3 className={titleClassName}>{title}</h3>
      {children}
    </div>
  )
}

/** 복잡도 한 칸: 이름 · 뜻을 알려 주는 "?" · 값. */
function ComplexityCell({
  name,
  help,
  children,
}: {
  name: string
  help: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-[14px] border px-4 py-[18px]">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-[13px]">
        {name}
        <Tooltip label={help}>
          <button
            type="button"
            aria-label={`${name} 설명`}
            className="bg-muted inline-flex size-4 flex-none cursor-help items-center justify-center rounded-full text-[11px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
          >
            ?
          </button>
        </Tooltip>
      </dt>
      <dd className="m-0 flex min-w-0 flex-wrap items-center gap-2">{children}</dd>
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
        <>
          <Section title="복잡도" titleClassName="text-muted-foreground text-sm font-semibold">
            {/* 패널은 넓은 화면에서도 반쪽 칸이라 화면 폭이 아니라 패널 폭(@)으로 나눈다.
                값은 모델이 쓴 O 표기라 공백 없이 길 수 있다. min-w-0으로 칸이 줄고 아무 데서나 끊는다(#273 리뷰) */}
            <dl className="m-0 grid grid-cols-1 gap-2.5 @lg:grid-cols-3">
              <ComplexityCell name="시간" help="입력이 커질 때 실행 시간이 얼마나 늘어나는지예요.">
                <span className={VALUE}>{complexity.time}</span>
              </ComplexityCell>
              <ComplexityCell name="공간" help="입력이 커질 때 메모리를 얼마나 더 쓰는지예요.">
                <span className={VALUE}>{complexity.space}</span>
              </ComplexityCell>
              {/* 문제에 적힌 값이 아니라 AI의 어림이다(계약) */}
              <ComplexityCell
                name="의도한 시간(추정)"
                help="문제가 기대하는 빠르기를 AI가 어림한 값이에요. 문제에 적힌 값은 아니에요."
              >
                <span className={VALUE}>{complexity.intendedTime}</span>
                <Badge tone={complexity.meetsIntended ? 'success' : 'warning'}>
                  {complexity.meetsIntended ? '의도한 만큼 빨라요' : '더 줄일 수 있어요'}
                </Badge>
              </ComplexityCell>
            </dl>
            <p className={PROSE}>{complexity.comparison}</p>
          </Section>
          <Section title="왜 이런 복잡도인가요?">
            <p className={PROSE}>{complexity.basis}</p>
          </Section>
        </>
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
          <ul className="m-0 grid list-none grid-cols-1 gap-2.5 p-0 @lg:grid-cols-2">
            {review.nextConcepts.map((concept, index) => (
              // 홀수 개의 마지막 카드는 옆 칸이 비지 않게 한 줄을 다 쓴다
              <li
                key={index}
                className="flex min-w-0 flex-col gap-1.5 rounded-[14px] border px-4 py-3.5 @lg:last:odd:col-span-2"
              >
                {/* 모델이 정한 이름이라 길 수 있다. 배지의 고정 높이·한 줄을 풀어 카드 안에서 줄을 바꾼다(#273 리뷰) */}
                <Badge
                  tone="neutral"
                  className="text-foreground font-bold h-auto min-h-[26px] self-start py-1 whitespace-normal [overflow-wrap:anywhere]"
                >
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
      {loaded && working ? <LoadingState inPanel /> : null}
      {done ? (
        <div className="@container flex min-w-0 flex-col gap-5">
          <Review review={data} />
        </div>
      ) : null}
      <AiRequest
        result={data ?? null}
        request={request}
        canRequest={canRequest}
        invite={invite}
        label="AI 리뷰"
      />
    </section>
  )
}
