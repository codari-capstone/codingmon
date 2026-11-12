import { cn } from '@/lib/utils'

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
 * 유형별 진행이나 목표 달성처럼 얼마나 찼는지 아는 값을 보여 주는 막대.
 * 진행률을 모르는 기다림에는 쓰지 않는다(채점 중은 Verdict, 불러오는 중은 LoadingState).
 *
 * 막대 폭과 보조기기가 읽는 값(aria-valuenow)은 0~max로 같이 자른다. 범위를 넘는 원래 값은
 * aria-valuetext로 알린다. max가 0 이하면(문제가 없는 유형) 빈 막대다.
 */
export function Progress({
  value,
  max = 100,
  label,
  showValue,
  tone = 'brand',
  className,
}: ProgressProps) {
  const now = Math.max(0, Math.min(max, value))
  const pct = max > 0 ? (now / max) * 100 : 0
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
        aria-valuenow={now}
        aria-valuemin={0}
        aria-valuemax={Math.max(max, 0)}
        aria-valuetext={now === value ? undefined : `${value} / ${max}`}
        aria-label={label}
        className="bg-muted dark:bg-background h-2.5 overflow-hidden rounded-full"
      >
        <div
          style={{ width: `${pct}%` }}
          className={cn(
            'h-full rounded-[inherit] transition-[width] duration-[400ms] motion-reduce:transition-none',
            // 아주 작은 값도 둥근 막대로 보이게 하는 최소 폭. 0이면 주지 않는다 — 진행한 것처럼 보인다
            pct > 0 && 'min-w-2.5',
            tone === 'success' ? 'bg-success-text' : 'bg-primary',
          )}
        />
      </div>
    </div>
  )
}
