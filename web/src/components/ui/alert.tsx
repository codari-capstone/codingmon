import { cn } from '@/lib/utils'

import { Icon } from '@/components/ui/icon'

/** 상태별 아이콘 경로(원 안 표시). 디자인 시스템의 toneIcon과 같다. */
const TONE_PATH = {
  success: 'M9 12.5l2 2 4-4.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  danger: 'M9.5 9.5l5 5m0-5l-5 5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  warning: 'M12 7.5V12l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  info: 'M12 11v5m0-8.5v.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
} as const

const TONE = {
  brand: 'bg-accent text-primary-text',
  info: 'bg-info-soft text-info-text',
  success: 'bg-success-soft text-success-text',
  warning: 'bg-warning-soft text-warning-text',
  danger: 'bg-destructive-soft text-destructive-text',
} as const

interface AlertProps {
  /** 기본 info */
  tone?: keyof typeof TONE
  /** 한 줄 */
  title?: React.ReactNode
  /** 한두 문장 */
  children?: React.ReactNode
  /** 작은 버튼 하나 */
  action?: React.ReactNode
  onClose?: () => void
  className?: string
}

/**
 * 화면 안에 머무는 안내·경고 상자. danger만 `role="alert"`로 바로 읽어 주고 나머지는 `status`다.
 * 잠깐 뜨고 사라지는 알림에는 Toast, 채점 결과에는 Verdict를 쓰며 한 화면에 셋 넘게 쌓지 않는다.
 * 제목·본문은 상자 색의 글자색이 아니라 본문색이다 — 색 글자는 제목과 아이콘만이다.
 */
export function Alert({ tone = 'info', title, children, action, onClose, className }: AlertProps) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-3 rounded-lg px-4 py-3.5', TONE[tone], className)}
    >
      <span className="mt-px inline-flex">
        {tone === 'brand' ? (
          <Icon name="bulb" size={20} />
        ) : (
          <svg viewBox="0 0 24 24" width={20} height={20} aria-hidden="true">
            <path
              d={TONE_PATH[tone]}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      <div className="min-w-0 flex-1">
        {title ? <div className="text-[15px] leading-[1.45] font-bold">{title}</div> : null}
        {children ? (
          <div className="text-body-foreground text-sm leading-[1.6] font-normal">{children}</div>
        ) : null}
      </div>
      {action ? <div className="self-center">{action}</div> : null}
      {onClose ? (
        <button
          type="button"
          aria-label="닫기"
          onClick={onClose}
          className="focus-visible:outline-ring inline-flex size-6 shrink-0 items-center justify-center rounded-full hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <Icon name="x" size={16} />
        </button>
      ) : null}
    </div>
  )
}
