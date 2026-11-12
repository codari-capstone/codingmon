import { cn } from 'cn'

interface ProgressProps {
  value: number
  /** 기본 100 */
  max?: number
  label?: string
  /** `value / max` 숫자를 오른쪽에 보인다 */
  showValue?: boolean
  /** 다 채웠으면 success */
  tone?: 'brand' | 'success'
  className?: string
}

/**
 * 유형별 진행이나 목표 달성을 보여 주는 막대. 시간이 걸리는 작업의 로딩 표시로 쓰지 않는다
 * (채점 중은 Verdict, 불러오는 중은 LoadingState).
 */
export function Progress({
  value,
  max = 100,
  label,
  showValue,
  tone = 'brand',
  className,
}: ProgressProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label || showValue ? (
        <div className="text-foreground flex justify-between text-sm font-semibold">
          <span>{label}</span>
          {showValue ? (
            <span className="text-muted-foreground tabular-nums">
              {value} / {max}
            </span>
          ) : null}
        </div>
      ) : null}
      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
        className="bg-muted dark:bg-background h-2.5 overflow-hidden rounded-full"
      >
        <div
          style={{ width: `${pct}%` }}
          className={cn(
            'h-full min-w-2.5 rounded-[inherit] transition-[width] duration-[400ms] motion-reduce:transition-none',
            tone === 'success' ? 'bg-success-text' : 'bg-primary',
          )}
        />
      </div>
    </div>
  )
}
