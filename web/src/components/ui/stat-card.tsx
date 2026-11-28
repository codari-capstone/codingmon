import { cn } from '@/lib/utils'

import { Icon, type IconName } from '@/components/ui/icon'

const DELTA = {
  success: 'text-success-text',
  danger: 'text-destructive-text',
  muted: 'text-muted-foreground',
} as const

interface StatCardProps {
  label: string
  value: React.ReactNode
  unit?: string
  icon?: IconName
  /** 변화량. 색은 deltaTone */
  delta?: string
  /** 기본 success */
  deltaTone?: keyof typeof DELTA
  /** 기간 같은 보충 글 */
  hint?: string
  /** 가장 자랑할 숫자 하나만 inverse (남색 면 + 노랑 아이콘) */
  tone?: 'default' | 'inverse'
  className?: string
}

/** 숫자 하나를 크게 보여 주는 통계 카드. 값에는 문장을 넣지 않고, 한 줄에 다섯 개를 넘기지 않는다. */
export function StatCard({
  label,
  value,
  unit,
  icon,
  delta,
  deltaTone = 'success',
  hint,
  tone = 'default',
  className,
}: StatCardProps) {
  const inverse = tone === 'inverse'
  const sub = inverse ? 'text-inverse-muted' : 'text-muted-foreground'
  return (
    <div
      className={cn(
        'flex flex-col gap-1.5 rounded-lg border p-6',
        inverse ? 'bg-inverse border-transparent' : 'bg-card',
        className,
      )}
    >
      <div className={cn('flex items-center gap-2 text-[13px] font-semibold', sub)}>
        {icon ? (
          <span
            className={cn(
              'inline-flex size-8 items-center justify-center rounded-full',
              inverse ? 'bg-highlight text-highlight-foreground' : 'bg-accent text-primary-text',
            )}
          >
            <Icon name={icon} size={18} />
          </span>
        ) : null}
        <span>{label}</span>
      </div>
      <p
        className={cn(
          'text-[36px] leading-[1.15] font-bold tracking-[-0.03em] tabular-nums',
          inverse ? 'text-inverse-foreground' : 'text-foreground',
        )}
      >
        {value}
        {unit ? (
          <span className={cn('ml-1 text-base font-semibold tracking-normal', sub)}>{unit}</span>
        ) : null}
      </p>
      {delta || hint ? (
        <p className={cn('flex items-center gap-1.5 text-[13px] font-medium', sub)}>
          {delta ? (
            <span className={cn('font-bold', inverse ? 'text-highlight' : DELTA[deltaTone])}>
              {delta}
            </span>
          ) : null}
          {hint}
        </p>
      ) : null}
    </div>
  )
}
