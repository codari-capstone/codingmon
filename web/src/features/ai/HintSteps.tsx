import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import type { SubmissionAnalysis } from '@/api/types'
import { Button } from '@/components/ui/button'
import { problemMessage } from '@/features/auth/problemCode'
import { useRevealHint } from './analysisQuery'

/** 단계 이름 (AI_FEATURES 4절). 순서가 곧 단계다. */
const HINT_STEPS = ['관찰', '방향', '원리'] as const

/**
 * 단계별 힌트 (AI-04)와 다시 제출하러 가는 길.
 *
 * 연 단계는 글로, 다음 단계는 켜진 버튼으로, 그 뒤 단계는 꺼진 버튼으로 보인다. 서버가 연
 * 단계까지만 힌트를 주므로(계약) 화면이 미리 받아 둔 글은 없다.
 *
 * 버튼을 누르면 그 버튼이 힌트 글로 바뀌어 사라진다. 포커스가 문서 맨 앞으로 튀지 않게
 * 방금 연 힌트로 옮긴다 — 키보드·스크린 리더 사용자가 무엇이 열렸는지 바로 읽는다.
 */
export function HintSteps({
  submissionId,
  analysis,
  retryPath,
}: {
  submissionId: number
  analysis: SubmissionAnalysis
  /** 다시 풀기와 같은 주소 (solvePath). 저장해 둔 코드가 열린다. */
  retryPath: string
}) {
  const reveal = useRevealHint(submissionId)
  const revealed = analysis.hints.length
  const next = revealed + 1

  const [justOpened, setJustOpened] = useState<number | null>(null)
  const openedRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (justOpened !== null && justOpened <= revealed) openedRef.current?.focus()
  }, [justOpened, revealed])

  return (
    <section aria-labelledby="hints-heading" className="flex flex-col gap-3">
      <h3 id="hints-heading" className="text-sm font-semibold">
        단계별 힌트
      </h3>
      <ol className="flex flex-col gap-3">
        {HINT_STEPS.map((name, index) => {
          const level = index + 1
          const label = `${level}단계 ${name}`
          const hint = analysis.hints[index]
          return (
            <li key={name} className="flex flex-col gap-1">
              {hint !== undefined ? (
                <>
                  <p className="text-xs font-medium">{label}</p>
                  <p
                    ref={level === justOpened ? openedRef : undefined}
                    tabIndex={-1}
                    className="text-sm leading-relaxed whitespace-pre-wrap outline-none [overflow-wrap:anywhere]"
                  >
                    {hint}
                  </p>
                </>
              ) : (
                <div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="min-h-11"
                    disabled={level !== next || reveal.isPending}
                    aria-describedby={level > next ? 'hint-order' : undefined}
                    onClick={() => reveal.mutate(level, { onSuccess: () => setJustOpened(level) })}
                  >
                    {`${label} 보기`}
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {revealed < HINT_STEPS.length ? (
        <p id="hint-order" className="text-muted-foreground text-sm">
          힌트는 앞 단계부터 하나씩 열 수 있어요.
        </p>
      ) : (
        // 3단계가 마지막이다(AI_FEATURES 4절). 정답 코드 보기는 없다.
        <p className="text-muted-foreground text-sm leading-relaxed">
          3단계가 마지막 힌트예요. 코드를 고쳐 다시 제출하고, 그래도 틀리면 새로 AI 분석을 받아
          보세요.
        </p>
      )}

      {reveal.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {problemMessage(reveal.error)}
        </p>
      ) : null}

      <div>
        <Button asChild variant="secondary" className="min-h-11">
          <Link to={retryPath}>코드 고치러 가기</Link>
        </Button>
      </div>
    </section>
  )
}
