import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import type { SubmissionAnalysis } from '@/api/types'
import { Button } from '@/components/ui/button'
import { HintBox } from '@/components/ui/hint-box'
import { Stepper } from '@/components/ui/stepper'
import { problemMessage } from '@/features/auth/problemCode'
import { useRevealHint } from './analysisQuery'

/** 단계 이름 (AI_FEATURES 4절). 순서가 곧 단계다. */
const HINT_STEPS = ['관찰', '방향', '원리'] as const

/**
 * 단계별 힌트 (AI-04)와 다시 제출하러 가는 길.
 *
 * 연 단계는 힌트 상자로, 다음 단계는 버튼 하나로, 진행은 단계 표시로 보인다. 서버가 연
 * 단계까지만 힌트를 주므로(계약) 화면이 미리 받아 둔 글은 없다.
 *
 * 버튼을 누르면 새 힌트가 버튼 위에 열린다. 포커스가 버튼에 남아 있으면 무엇이 열렸는지 모르므로
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
  // 단계는 셋뿐이다(계약: 길이 = revealedHintLevel ≤ 3). 넘쳐 와도 이름 없는 단계를 그리지 않는다
  const hints = analysis.hints.slice(0, HINT_STEPS.length)
  const revealed = hints.length
  const next = revealed + 1

  const [justOpened, setJustOpened] = useState<number | null>(null)
  const openedRef = useRef<HTMLParagraphElement>(null)
  useEffect(() => {
    if (justOpened !== null && justOpened <= revealed) openedRef.current?.focus()
  }, [justOpened, revealed])

  return (
    <section aria-labelledby="hints-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="hints-heading" className="text-muted-foreground text-sm font-semibold">
          단계별 힌트
        </h3>
        {/* 다 열면 current가 3이라 세 단계 모두 완료로 보인다 */}
        <Stepper
          steps={HINT_STEPS.map((label) => ({ label }))}
          current={revealed}
          className="w-[300px] max-w-full"
        />
      </div>

      {/* 연 단계만 글로 보인다. 서버가 연 단계까지만 힌트를 준다(계약) */}
      {revealed > 0 ? (
        <ol className="m-0 flex list-none flex-col gap-3 p-0">
          {hints.map((hint, index) => {
            const level = index + 1
            return (
              <li key={level}>
                <HintBox step={`힌트 ${level} · ${HINT_STEPS[index]}`}>
                  <p
                    ref={level === justOpened ? openedRef : undefined}
                    tabIndex={-1}
                    className="whitespace-pre-wrap outline-none [overflow-wrap:anywhere]"
                  >
                    {hint}
                  </p>
                </HintBox>
              </li>
            )
          })}
        </ol>
      ) : null}

      {/* 다음 단계 하나만 누를 수 있다. 그 뒤 단계는 위 단계 표시가 보여 준다 */}
      {next <= HINT_STEPS.length ? (
        <Button
          type="button"
          variant="soft"
          fullWidth
          className="min-h-11"
          disabled={reveal.isPending}
          aria-describedby="hint-order"
          onClick={() => reveal.mutate(next, { onSuccess: () => setJustOpened(next) })}
        >
          {`${next}단계 ${HINT_STEPS[next - 1]} 보기`}
        </Button>
      ) : null}

      {revealed < HINT_STEPS.length ? (
        <p id="hint-order" className="text-muted-foreground text-[13px]">
          힌트는 앞 단계부터 하나씩 열 수 있어요. 연 단계는 기록에 남아요.
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

      {/* 패널의 주 동작이다. 힌트를 보고 고치러 가는 것이 이 화면의 마지막 걸음이다 */}
      <Button asChild size="lg" fullWidth className="mt-2">
        <Link to={retryPath}>코드 고치러 가기</Link>
      </Button>
    </section>
  )
}
