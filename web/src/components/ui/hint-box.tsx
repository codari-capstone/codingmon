import { cn } from 'cn'

const TONE = {
  brand: { box: 'bg-accent', step: 'bg-card text-primary-text' },
  info: { box: 'bg-info-soft', step: 'bg-card text-info-text' },
  neutral: { box: 'bg-muted', step: 'bg-card text-muted-foreground' },
} as const

interface HintBoxProps {
  /** 예: "힌트 1 · 관찰" */
  step?: string
  /** 한 줄 요약 */
  title?: React.ReactNode
  /** 연 단계는 brand, 지난 단계는 neutral로 낮춘다. 일반 안내는 info. 기본 brand */
  tone?: keyof typeof TONE
  children: React.ReactNode
  className?: string
}

/**
 * AI 분석의 힌트 한 단계를 담는 옅은 상자(관찰 → 방향 → 원리).
 * 정답 코드를 넣지 않고, 경고·오류를 담지 않는다.
 */
export function HintBox({ step, title, tone = 'brand', children, className }: HintBoxProps) {
  const t = TONE[tone]
  return (
    <section className={cn('rounded-lg px-6 pt-[18px] pb-6', t.box, className)}>
      <div className="mb-2 flex items-center gap-2.5">
        {step ? (
          <span
            className={cn(
              'inline-flex h-[26px] items-center rounded-full px-2.5 text-xs font-bold',
              t.step,
            )}
          >
            {step}
          </span>
        ) : null}
        {title ? (
          <h4 className="text-foreground m-0 text-base leading-[1.45] font-bold">{title}</h4>
        ) : null}
      </div>
      <div className="text-body-foreground text-[15px] leading-[1.65] [&_p]:mb-2 [&_p:last-child]:mb-0">
        {children}
      </div>
    </section>
  )
}
