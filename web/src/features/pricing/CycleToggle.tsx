import { cn } from '@/lib/utils'
import { YEARLY_FREE_MONTHS, type Cycle } from './plans'

/**
 * 결제 주기 고르기 (PRICE-02, PAY-01). 고른 칸은 흰 면 + 그림자, 아닌 칸은 투명 + 흐린 글자.
 * `compact`는 결제 화면 카드 머리의 작은 토글이다('월간'·'연간').
 */
export function CycleToggle({
  cycle,
  onChange,
  compact,
  disabled,
}: {
  cycle: Cycle
  onChange: (c: Cycle) => void
  compact?: boolean
  disabled?: boolean
}) {
  const options: { value: Cycle; label: string }[] = [
    { value: 'monthly', label: compact ? '월간' : '월간 결제' },
    { value: 'yearly', label: compact ? '연간' : '연간 결제' },
  ]
  return (
    <div role="group" aria-label="결제 주기" className="bg-muted inline-flex rounded-full p-1">
      {options.map((o) => {
        const on = cycle === o.value
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              'focus-visible:outline-ring inline-flex cursor-pointer items-center gap-2 rounded-full border-0 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60',
              compact ? 'h-9 px-4 text-sm' : 'h-10 px-5 text-[15px]',
              on ? 'bg-card text-foreground shadow-card' : 'text-muted-foreground bg-transparent',
            )}
          >
            {o.label}
            {/* 공백이 없으면 이름이 '연간 결제2개월 무료'로 붙어 읽힌다. 간격은 gap이 맡는다.
                한 달도 안 아끼면 배지를 숨긴다 */}
            {o.value === 'yearly' && YEARLY_FREE_MONTHS > 0 ? (
              <>
                {' '}
                <span className="bg-success-soft text-success-text rounded-full px-2 py-0.5 text-xs font-bold">
                  {YEARLY_FREE_MONTHS}개월 무료
                </span>
              </>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
