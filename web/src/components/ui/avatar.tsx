import { cn } from 'cn'

import { Mascot, type MascotExpression } from '@/components/ui/mascot'

const STATUS = {
  online: 'bg-success',
  away: 'bg-warning',
  offline: 'bg-input',
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

/** 사람이나 코딩몬을 나타내는 원형 표시. AI 분석의 화자는 사람 아바타가 아니라 펭귄 얼굴을 쓴다. */
export function Avatar({ src, name, expression, size = 40, status, className }: AvatarProps) {
  return (
    <span
      role={name ? 'img' : undefined}
      aria-label={name}
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
            STATUS[status],
          )}
        />
      ) : null}
    </span>
  )
}
