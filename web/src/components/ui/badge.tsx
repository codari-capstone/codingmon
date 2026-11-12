import { cn } from 'cn'

const TONE = {
  neutral: 'bg-muted text-muted-foreground',
  outline: 'bg-card text-foreground font-bold shadow-[inset_0_0_0_1px_var(--border)]',
  brand: 'bg-accent text-primary-text',
  accent: 'bg-highlight text-highlight-foreground',
  success: 'bg-success-soft text-success-text',
  danger: 'bg-destructive-soft text-destructive-text',
  warning: 'bg-warning-soft text-warning-text',
  info: 'bg-info-soft text-info-text',
} as const

export type BadgeTone = keyof typeof TONE

interface BadgeProps {
  /** 기본 neutral */
  tone?: BadgeTone
  children: React.ReactNode
  className?: string
}

/**
 * 짧은 속성 하나(유형·난이도·언어·상태 수)를 보여 주는 알약 칩.
 * 판정 자체는 Verdict로 보여 주고, 칩을 버튼처럼 쓰지 않는다.
 */
export function Badge({ tone = 'neutral', children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
