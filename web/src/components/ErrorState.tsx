import { AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { toUserMessage } from '@/constants/errors'

interface ErrorStateProps {
  /** 서버 응답(RFC 9457)이나 throw된 값. 어떤 모양이어도 문구가 나온다. */
  problem: unknown
  onRetry?: () => void
}

/** 원문을 보여 줄 값이 있는지. 네트워크 오류는 보여 줄 것이 없다. */
function rawText(problem: unknown): string | null {
  if (typeof problem !== 'object' || problem === null) return null
  // Error 인스턴스는 열거 가능한 속성이 없어 JSON.stringify가 "{}"를 준다.
  // 그것을 보여 주면 "서버 응답 원문"에 빈 객체만 뜬다.
  if (Object.keys(problem).length === 0) return null
  try {
    return JSON.stringify(problem, null, 2)
  } catch {
    return null
  }
}

export function ErrorState({ problem, onRetry }: ErrorStateProps) {
  const message = toUserMessage(problem)
  const raw = rawText(problem)

  return (
    <div>
      <div className="border-destructive/30 bg-destructive/5 flex gap-3 rounded-xl border p-4">
        <AlertCircle className="text-destructive mt-0.5 size-5 shrink-0" aria-hidden="true" />
        <div>
          <h2 className="text-sm font-medium">{message.title}</h2>
          <p className="text-muted-foreground mt-1 text-sm">{message.description}</p>
          {onRetry && message.retryable ? (
            <Button variant="outline" onClick={onRetry} className="mt-3 min-h-11">
              다시 시도
            </Button>
          ) : null}
        </div>
      </div>
      {raw ? (
        <details className="text-muted-foreground mt-3 text-xs">
          <summary className="flex min-h-8 cursor-pointer items-center">서버 응답 원문</summary>
          <pre className="bg-muted mt-2 overflow-x-auto rounded-lg p-3 text-xs leading-relaxed">
            {raw}
          </pre>
        </details>
      ) : null}
    </div>
  )
}
