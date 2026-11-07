import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { SubmissionAnalysis } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { analysisQuery, useRequestAnalysis } from './analysisQuery'
import { countLines } from './countLines'

/** [실행 결과]/[코드 분석] 항목 하나 (AI-03). 모델이 만든 문장이라 글자 그대로 보여 준다(계약). */
function Item({ badge, text }: { badge: '실행 결과' | '코드 분석'; text: string }) {
  return (
    <li className="flex flex-col items-start gap-1">
      <span
        className={
          badge === '실행 결과'
            ? 'bg-muted text-foreground rounded-md px-2 py-0.5 text-xs font-medium'
            : 'border-border text-muted-foreground rounded-md border px-2 py-0.5 text-xs font-medium'
        }
      >
        {badge}
      </span>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
    </li>
  )
}

/**
 * 원인 설명 (AI-03).
 *
 * 줄 번호는 제출 코드의 줄 수를 넘으면 버린다. 계약: 서버가 아직 범위를 검사하지 않는다(#79).
 * 없는 줄을 짚으면 학생이 그 줄을 찾아 헤맨다.
 */
function Explanation({ analysis, lineCount }: { analysis: SubmissionAnalysis; lineCount: number }) {
  const lines = analysis.suspectLines.filter((line) => line <= lineCount)
  return (
    <div className="flex flex-col gap-3">
      {analysis.summary !== null ? (
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{analysis.summary}</p>
      ) : null}
      {lines.length > 0 ? (
        <p className="text-sm">
          <span className="font-medium">의심되는 줄: </span>
          {lines.map((line) => `${line}번`).join(', ')}
        </p>
      ) : null}
      {analysis.facts.length + analysis.guesses.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {analysis.facts.map((text, index) => (
            <Item key={`fact-${index}`} badge="실행 결과" text={text} />
          ))}
          {analysis.guesses.map((text, index) => (
            <Item key={`guess-${index}`} badge="코드 분석" text={text} />
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/**
 * 진행 문구. 결과 화면의 `Headline`처럼 live region 하나를 두고 내용만 바꾼다 —
 * 분기마다 노드가 바뀌면 '분석을 마쳤어요' 같은 마지막 변화가 안내되지 않는다.
 */
function statusText(working: boolean, analysis: SubmissionAnalysis | null): string {
  if (working) return 'AI가 분석하고 있어요…'
  if (analysis === null) return ''
  if (analysis.status === 'FAILED') return '분석을 만들지 못했어요. 다시 시도해 주세요.'
  // AI-06. 정답 코드가 섞여 결과를 숨긴 분석이다(계약). 다시 요청해도 새로 만들지 않는다.
  if (analysis.blocked)
    return '이 제출은 AI 분석을 보여 줄 수 없어요. 채점 결과와 쉬운 설명은 그대로 볼 수 있어요.'
  return '분석을 마쳤어요.'
}

/**
 * AI 오답 분석 (AI-01·02·03·06). 채점이 끝난 오답에서만 그린다(결과 화면이 고른다).
 *
 * 들어오면 저장된 분석부터 묻는다 — 새로고침하거나 제출 기록에서 다시 와도 이미 받은
 * 설명이 그대로 보인다. 요청한 적이 없으면 [AI 분석] 버튼이다.
 *
 * 이 패널의 오류는 패널 안에서 끝난다. 채점 결과는 그대로 보여야 한다(AI-06).
 *
 * shortcut: 오늘 남은 횟수(AI-01)와 한도 초과 구분(AI-06)은 계약에 없다(#80·#81). 계약에 들어오면 붙인다.
 */
export function AnalysisPanel({
  submissionId,
  sourceCode,
}: {
  submissionId: number
  sourceCode: string
}) {
  const queryClient = useQueryClient()
  const { data, isPending, error, refetch } = useQuery(analysisQuery(submissionId))
  const request = useRequestAnalysis(submissionId)

  // 결과 화면과 같은 이유로 읽기에도 건다 (session.ts).
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  let body: React.ReactNode
  if (isPending) {
    body = <ListSkeleton rows={2} />
  } else if (data === undefined) {
    body = <ErrorState problem={error} onRetry={() => void refetch()} />
  } else {
    const working = request.isPending || data?.status === 'PENDING'
    const done = !working && data?.status === 'COMPLETED' && !data.blocked
    // 요청한 적이 없거나 실패했을 때만 누를 수 있다. 끝난 분석은 다시 만들지 않는다(계약).
    const canRequest = !working && (data === null || data.status === 'FAILED')

    body = (
      <>
        <p role="status" className={done ? 'sr-only' : 'text-muted-foreground text-sm'}>
          {statusText(working, data)}
        </p>
        {data === null && !working ? (
          <p className="text-muted-foreground text-sm leading-relaxed">
            틀린 이유와 의심되는 줄을 AI가 짚어 줘요. 정답 코드는 알려 주지 않아요.
          </p>
        ) : null}
        {done ? <Explanation analysis={data} lineCount={countLines(sourceCode)} /> : null}
        {request.isError ? (
          <p role="alert" className="text-destructive text-sm">
            {problemMessage(request.error)}
          </p>
        ) : null}
        {canRequest ? (
          <div>
            <Button type="button" className="min-h-11" onClick={() => request.mutate()}>
              {data === null ? 'AI 분석' : '다시 시도'}
            </Button>
          </div>
        ) : null}
      </>
    )
  }

  return (
    <section
      aria-labelledby="analysis-heading"
      className="border-border/60 flex flex-col gap-3 rounded-lg border p-4"
    >
      <h2 id="analysis-heading" className="text-base font-medium">
        AI 분석
      </h2>
      {body}
    </section>
  )
}
