import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { SubmissionAnalysis } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import codingmonFace from '@/assets/brand/codingmon_face.png'
import thinkingScene from '@/assets/scenes/thinking.png'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import { problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { isDeadEnd } from '@/features/result/resultQuery'
import { analysisQuery, useRequestAnalysis } from './analysisQuery'
import { suspectLines } from './countLines'
import { HintSteps } from './HintSteps'

/** [실행 결과]/[코드 분석] 근거 하나 (AI-03). 모델이 만든 문장이라 글자 그대로 보여 준다(계약). */
function Item({ badge, text }: { badge: '실행 결과' | '코드 분석'; text: string }) {
  return (
    <li className="flex flex-wrap items-start gap-3 rounded-[14px] border px-4 py-3.5">
      {/* 사실(실행 결과)과 짐작(코드 분석)을 색으로도 가른다. 글자가 뜻을 전한다 */}
      <Badge tone={badge === '실행 결과' ? 'info' : 'brand'}>{badge}</Badge>
      <p className="text-body-foreground min-w-0 flex-1 text-[15px] leading-[1.6] whitespace-pre-wrap [overflow-wrap:anywhere]">
        {text}
      </p>
    </li>
  )
}

/** 원인 설명 (AI-03). 줄 번호를 거르는 규칙은 `suspectLines` 주석. */
function Explanation({
  analysis,
  sourceCode,
}: {
  analysis: SubmissionAnalysis
  sourceCode: string
}) {
  const lines = suspectLines(analysis.suspectLines, sourceCode)
  return (
    <>
      {analysis.summary !== null || lines.length > 0 ? (
        <div className="bg-muted flex flex-col items-start gap-2.5 rounded-[16px] p-5">
          {analysis.summary !== null ? (
            <p className="text-foreground text-lg leading-normal font-semibold whitespace-pre-wrap [overflow-wrap:anywhere]">
              {analysis.summary}
            </p>
          ) : null}
          {lines.length > 0 ? (
            <Badge tone="danger">{`의심되는 줄 · ${lines.map((line) => `${line}번`).join(', ')}`}</Badge>
          ) : null}
        </div>
      ) : null}
      {analysis.facts.length + analysis.guesses.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <h3 className="text-muted-foreground text-sm font-semibold">근거</h3>
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {analysis.facts.map((text, index) => (
              <Item key={`fact-${index}`} badge="실행 결과" text={text} />
            ))}
            {analysis.guesses.map((text, index) => (
              <Item key={`guess-${index}`} badge="코드 분석" text={text} />
            ))}
          </ul>
        </div>
      ) : null}
    </>
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
 * AI 오답 분석 (AI-01·02·03·06)과 단계별 힌트 (AI-04). 채점이 끝난 오답에서만 그린다(결과 화면이 고른다).
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
  retryPath,
}: {
  submissionId: number
  sourceCode: string
  /** [코드 고치러 가기]의 주소. 결과 화면의 [다시 풀기]와 같다 (solvePath). */
  retryPath: string
}) {
  const queryClient = useQueryClient()
  const { data, isPending, error, refetch } = useQuery(analysisQuery(submissionId))
  const request = useRequestAnalysis(submissionId)

  // 결과 화면과 같은 이유로 읽기에도 건다 (session.ts).
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  // 오류를 띄우는 때와 폴링을 멈추는 때가 같다 (resultQuery의 isDeadEnd). 데이터만 보면
  // `PENDING`을 든 채 403이 와서 폴링이 멈춰도 '분석하고 있어요'에 갇힌다.
  const deadEnd = isDeadEnd(error, data !== undefined)
  const loaded = !deadEnd && !isPending && data !== undefined
  const working = request.isPending || data?.status === 'PENDING'
  const done = loaded && !working && data?.status === 'COMPLETED' && !data.blocked
  // 요청한 적이 없거나 실패했을 때만 누를 수 있다. 끝난 분석은 다시 만들지 않는다(계약).
  const canRequest = loaded && !working && (data === null || data.status === 'FAILED')
  // 한 번도 요청하지 않은 오답은 남색 안내 카드로 권한다(디자인 ResultRuntime)
  const invite = loaded && data === null && !working

  const requestError = request.isError ? (
    <p
      role="alert"
      className={invite ? 'text-inverse-foreground text-sm' : 'text-destructive-text text-sm'}
    >
      {problemMessage(request.error)}
    </p>
  ) : null
  const requestButton = canRequest ? (
    <Button
      type="button"
      size={invite ? 'lg' : 'md'}
      fullWidth={invite}
      className="min-h-11 self-start"
      onClick={() => request.mutate()}
    >
      {data === null ? 'AI 분석' : '다시 시도'}
    </Button>
  ) : null

  return (
    /*
      안내 카드(남색)와 분석 패널(흰색)이 **같은 section**이다. 둘을 다른 요소로 그리면 [AI 분석]을
      누르는 순간 live region이 '분석하고 있어요'를 담은 채 새로 붙어 안내되지 않는다(결과 화면
      Headline 주석). 그래서 live region을 늘 첫 자식에 두고, 머리줄은 order로 그 위에 보인다.
    */
    <section
      aria-labelledby="analysis-heading"
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
            src={thinkingScene}
            alt=""
            width={170}
            height={150}
            className="-order-1 mx-auto block h-auto max-w-full"
          />
          <h2 id="analysis-heading" className="text-eyebrow text-inverse-accent mt-2">
            AI 분석
          </h2>
          <p className="text-[22px] leading-[1.35] font-bold tracking-[-0.02em]">
            틀린 이유를 같이 찾아볼까요?
          </p>
          <p className="text-inverse-muted text-[15px] leading-[1.65]">
            틀린 이유와 의심되는 줄을 AI가 짚어 줘요. 정답 코드는 알려 주지 않아요.
          </p>
        </>
      ) : (
        <div className="-order-1 flex items-center gap-3">
          {/* 디자인의 화자 표시: 옅은 파랑 원 안의 펭귄 얼굴. 장식이라 alt를 비운다 */}
          <span className="bg-accent inline-flex size-11 flex-none overflow-hidden rounded-full">
            <img src={codingmonFace} alt="" width={44} height={44} className="block" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="analysis-heading" className="text-foreground text-lg font-bold">
              AI 분석
            </h2>
            <p className="text-muted-foreground mt-0.5 text-[13px]">
              채점 결과를 근거로 원인을 짚어요. 정답 코드는 알려 주지 않아요.
            </p>
          </div>
          {done ? <Badge tone="success">분석 완료</Badge> : null}
        </div>
      )}

      {deadEnd ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}
      {!deadEnd && !loaded ? <ListSkeleton rows={2} /> : null}
      {done ? (
        <>
          <Explanation analysis={data} sourceCode={sourceCode} />
          <HintSteps submissionId={submissionId} analysis={data} retryPath={retryPath} />
        </>
      ) : null}
      {requestError}
      {requestButton}
    </section>
  )
}
