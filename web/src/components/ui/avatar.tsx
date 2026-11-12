import { cn } from 'cn'

import { Mascot, type MascotExpression } from '@/components/ui/mascot'

const STATUS = {
  online: { className: 'bg-success', label: '접속 중' },
  away: { className: 'bg-warning', label: '자리 비움' },
  offline: { className: 'bg-input', label: '접속 안 함' },
} as const

interface AvatarProps {
  /** 사진 주소 */
  src?: string
  /** 사진이 없으면 첫 글자가 옅은 파랑 원에 들어간다 */
  name?: string
  /** 둘 다 없을 때 펭귄 얼굴의 표정 */
  expression?: MascotExpression
  /** 기본 40. 24보다 작게 쓰지 않는다 */
  size?: number
  status?: keyof typeof STATUS
  className?: string
}

/**
 * 사람이나 코딩몬을 나타내는 원형 표시. AI 분석의 화자는 사람 아바타가 아니라 펭귄 얼굴을 쓴다.
 * 접속 상태는 점의 색만으로 알리지 않는다 — 이름과 함께 읽히고(role="img"의 이름), 올리면 글자로 보인다.
 */
export function Avatar({ src, name, expression, size = 40, status, className }: AvatarProps) {
  const label = [name, status && STATUS[status].label].filter(Boolean).join(', ') || undefined
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      title={status ? STATUS[status].label : undefined}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={cn(
        'bg-accent text-primary-text relative inline-flex shrink-0 items-center justify-center rounded-full font-bold',
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" className="size-full rounded-full object-cover" />
      ) : name ? (
        <span aria-hidden="true">{name.trim().slice(0, 1).toUpperCase()}</span>
      ) : (
        <Mascot variant="face" expression={expression} size={size} />
      )}
      {status ? (
        <span
          data-status={status}
          className={cn(
            'ring-card absolute right-0 bottom-0 size-[28%] min-h-2 min-w-2 rounded-full ring-2',
            STATUS[status].className,
          )}
        />
      ) : null}
    </span>
  )
}
