import { useId, useState } from 'react'
import { Link } from 'react-router'

import type { SubmissionAnalysis } from '@/api/types'
import codingmonFace from '@/assets/brand/codingmon_face.png'
import { SuspectLinesBadge } from '@/features/ai/AnalysisPanel'
import { HintSteps } from '@/features/ai/HintSteps'
import { cn } from '@/lib/utils'

const collapsedKey = (problemId: number) => `solve-hints-collapsed:${problemId}`

/** 접은 상태는 이 탭에서만 기억한다(문제별). 저장소를 못 쓰는 브라우저는 늘 펼친다 */
function readCollapsed(problemId: number): boolean {
  try {
    return sessionStorage.getItem(collapsedKey(problemId)) === '1'
  } catch {
    return false
  }
}

function storeCollapsed(problemId: number, collapsed: boolean) {
  try {
    if (collapsed) sessionStorage.setItem(collapsedKey(problemId), '1')
    else sessionStorage.removeItem(collapsedKey(problemId))
  } catch {
    // 기억하지 못해도 지금 화면은 접힌다
  }
}

/**
 * [다시 풀기]로 온 제출의 AI 힌트. 결과 화면에 다녀오지 않고 고치면서 다시 본다.
 *
 * 힌트 목록과 다음 단계 열기는 결과 화면의 `HintSteps` 그대로다 — 무료 플랜 잠금과 포커스 이동을
 * 두 곳에 나눠 두지 않는다. 같은 쿼리 캐시를 고치므로 여기서 연 단계가 결과 화면에도 보인다.
 *
 * 넓은 화면은 지문 위 접이식 카드(`collapsible`), 좁은 화면은 힌트 탭 안의 내용이다.
 */
export function SolveHints({
  problemId,
  analysis,
  lines,
  collapsible = false,
}: {
  problemId: number
  analysis: SubmissionAnalysis
  /** 에디터에 지금 남은 의심 줄(고친 줄은 빠지고 밀린 줄은 따라간다). 제출 코드를 받지 않았으면 비어 있다 */
  lines: number[]
  collapsible?: boolean
}) {
  const id = useId()
  const [collapsed, setCollapsed] = useState(() => collapsible && readCollapsed(problemId))
  const revealed = analysis.hints.length
  const toggle = () => {
    storeCollapsed(problemId, !collapsed)
    setCollapsed(!collapsed)
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className={cn(
        'flex min-w-0 flex-col gap-4',
        collapsible && 'bg-card border-primary shadow-card rounded-lg border p-5',
      )}
    >
      <div className="flex items-center gap-3">
        <span className="bg-accent inline-flex size-10 flex-none overflow-hidden rounded-full">
          <img src={codingmonFace} alt="" width={40} height={40} className="block" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`${id}-title`} className="text-foreground font-bold">
            AI 힌트
            {revealed > 0 ? (
              <span className="text-muted-foreground font-normal">{` · ${revealed}단계까지 열었어요`}</span>
            ) : null}
          </h2>
          <p className="text-muted-foreground text-[13px]">
            {revealed > 0
              ? `제출 #${analysis.submissionId}에서 연 힌트예요. 코드를 고치면서 다시 볼 수 있어요.`
              : `제출 #${analysis.submissionId}의 AI 분석이에요. 코드를 고치면서 힌트를 열어 볼 수 있어요.`}
          </p>
        </div>
        {collapsible ? (
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={`${id}-body`}
            onClick={toggle}
            className="text-muted-foreground hover:text-foreground min-h-11 flex-none rounded-md px-2 text-sm"
          >
            {collapsed ? '펼치기 ⌄' : '접기 ⌃'}
          </button>
        ) : null}
      </div>

      <div id={`${id}-body`} hidden={collapsed} className="flex flex-col gap-4">
        {analysis.summary !== null || lines.length > 0 ? (
          <div className="bg-muted flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-4 py-3">
            <SuspectLinesBadge lines={lines} />
            {analysis.summary !== null ? (
              // basis를 주어 좁으면 배지 아래 줄로 내려간다. basis 0이면 몇 픽셀 폭에 글자 단위로 쪼개진다
              <p className="text-body-foreground min-w-0 flex-[1_1_14rem] text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">
                {analysis.summary}
              </p>
            ) : null}
          </div>
        ) : null}
        <HintSteps submissionId={analysis.submissionId} analysis={analysis} />
        {/* 새 탭으로 연다. 이 화면을 떠나면 고치던 코드를 지운다(SOLVE-11) — 분석을 다시 읽으려다 잃으면 안 된다 */}
        <Link
          to={`/submissions/${analysis.submissionId}`}
          target="_blank"
          rel="noreferrer"
          className="text-primary-text self-end text-sm font-semibold hover:underline"
        >
          분석 전체 보기 →<span className="sr-only"> (새 탭)</span>
        </Link>
      </div>
    </section>
  )
}
