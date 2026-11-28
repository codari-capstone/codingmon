import { CircleCheck, CircleX, Clock, Info, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 판정 색 묶음 (디자인 시스템 '판정 색', 값은 src/index.css). 판정·풀이 상태는 이 다섯 가지로만 칠한다.
 * muted는 판정 색이 없는 상태(채점 불가, 안 품)다.
 */
export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'muted'

const TONE: Record<StatusTone, { className: string; icon: LucideIcon | null }> = {
  success: { className: 'text-success-text', icon: CircleCheck },
  danger: { className: 'text-destructive-text', icon: CircleX },
  warning: { className: 'text-warning-text', icon: Clock },
  info: { className: 'text-info-text', icon: Info },
  muted: { className: 'text-muted-foreground', icon: null },
}

interface StatusTextProps {
  tone: StatusTone
  children: React.ReactNode
  className?: string
  /** tone의 아이콘 대신 쓸 아이콘. 채점 중의 돌아가는 아이콘처럼 상태가 다를 때만 */
  icon?: LucideIcon
  /** 아이콘에만 붙는 클래스 */
  iconClassName?: string
}

/**
 * 판정·풀이 상태를 색 글자 + 아이콘으로 보여 준다. 색 면 배지를 쓰지 않는 것은 자주 틀리는
 * 학습자에게 화면이 덜 부담스럽게 하려는 디자인 결정이다("틀려도 괜찮다고 말한다").
 *
 * 글자가 뜻을 전하고 아이콘은 aria-hidden이다. 색만으로 알리지 않도록 아이콘을 함께 둔다.
 * 글자색은 채움 색이 아니라 `-text` 토큰이다 — 채움 색을 글자로 쓰면 경고·정보가 4.5:1에 못 미친다.
 * 아이콘은 글자 크기를 따라간다(1.1em). 표의 작은 글자와 결과 화면의 큰 판정에 같은 조각을 쓴다.
 * 카드 안 옅은 면(`bg-muted`) 위에서도 네 색 모두 4.5:1을 넘는다(가장 낮은 것이 밝은 모드 성공 5.0:1).
 */
export function StatusText({ tone, children, className, icon, iconClassName }: StatusTextProps) {
  const { className: toneClass, icon: toneIcon } = TONE[tone]
  const Icon = icon ?? toneIcon
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium', toneClass, className)}>
      {Icon ? (
        <Icon aria-hidden="true" className={cn('size-[1.1em] shrink-0', iconClassName)} />
      ) : null}
      {children}
    </span>
  )
}
