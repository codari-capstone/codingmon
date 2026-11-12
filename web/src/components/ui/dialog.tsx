import { useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from 'cn'
import { Dialog as DialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'

/*
 * 디자인 시스템 Modal의 모양. 확인용 대화상자(alert-dialog)도 같은 값을 쓴다.
 * 떠 있는 면은 그림자로 경계를 그리는데, 고대비(forced-colors)에서는 그림자가 지워져 면이 바탕과
 * 붙어 버린다(#257 리뷰). 그 모드에서만 1px 테두리를 그린다.
 */
export const MODAL_OVERLAY =
  'fixed inset-0 z-50 bg-[rgba(14,17,29,0.5)] backdrop-blur-[4px] data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 motion-reduce:animate-none'
export const MODAL_PANEL =
  'fixed top-1/2 left-1/2 z-50 max-h-[calc(100%-3rem)] w-[calc(100%-3rem)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-card p-6 text-foreground shadow-pop outline-hidden sm:p-8 dark:shadow-[var(--elevation-pop),inset_0_0_0_1px_var(--border)] forced-colors:border data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 motion-reduce:animate-none'
export const MODAL_SIZE = {
  sm: 'max-w-[360px]',
  md: 'max-w-[460px]',
  lg: 'max-w-[640px]',
} as const
export const MODAL_MEDIA = 'mb-4 flex'
export const MODAL_TITLE =
  'm-0 text-[22px] leading-[1.35] font-bold tracking-[-0.02em] text-foreground'
export const MODAL_DESC = 'mt-2 text-[15px] leading-[1.6] text-muted-foreground'
export const MODAL_BODY = 'mt-4 text-[15px] leading-[1.6] text-body-foreground'
// 보조 버튼 왼쪽·주 동작 오른쪽. 좁은 화면에서는 주 동작이 위로 오게 세로로 쌓는다
export const MODAL_FOOTER = 'mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end'

/**
 * 화면 위에 떠서 확인이나 집중이 필요한 내용을 보여 준다(정답 축하, 짧은 입력).
 * 되돌릴 수 없는 동작 확인은 바깥을 눌러 닫히면 안 되므로 alert-dialog를 쓴다.
 * 단순 알림에는 Toast, 모달 위에 모달을 띄우지 않는다. 지우기 확인의 버튼 이름은 '확인'이 아니라 동작([지우기]).
 *
 * 닫기는 X·바깥 누르기·Esc. 포커스를 가두는 일은 Radix가 맡는다. 닫힌 뒤 연 버튼으로 돌려놓는 일은
 * Radix가 자기 Trigger로 열었을 때만 해 준다 — 이 Modal은 open을 밖에서 받으니 열 때 포커스가 있던 곳을
 * 기억했다가 돌려놓는다.
 */
function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  media,
  size = 'md',
  align = 'start',
  className,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  children?: React.ReactNode
  /** 버튼 묶음. 보조 왼쪽·주 동작 오른쪽 */
  footer?: React.ReactNode
  /** 제목 위 그림 (보통 펭귄) */
  media?: React.ReactNode
  size?: keyof typeof MODAL_SIZE
  align?: 'start' | 'center'
  className?: string
}) {
  const center = align === 'center'
  const opener = useRef<HTMLElement | null>(null)
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={MODAL_OVERLAY} />
        <DialogPrimitive.Content
          data-slot="modal"
          className={cn(MODAL_PANEL, MODAL_SIZE[size], center && 'text-center', className)}
          // 설명이 없으면 Radix가 찾는 aria-describedby를 끊는다(없는 id를 가리키지 않게)
          {...(description ? {} : { 'aria-describedby': undefined })}
          // 포커스를 옮기기 직전이라 activeElement가 아직 연 버튼이다
          onOpenAutoFocus={() => {
            opener.current = document.activeElement as HTMLElement | null
          }}
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault()
              opener.current.focus()
            }
          }}
        >
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="sm"
              shape="circle"
              aria-label="닫기"
              className="absolute top-3.5 right-3.5"
            >
              <X aria-hidden />
            </Button>
          </DialogPrimitive.Close>
          {media ? (
            <div className={cn(MODAL_MEDIA, center && 'justify-center')}>{media}</div>
          ) : null}
          {/* 닫기 버튼(40px)과 제목이 겹치지 않게 오른쪽을 비운다 */}
          <DialogPrimitive.Title className={cn(MODAL_TITLE, center ? 'px-8' : 'pr-8')}>
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className={MODAL_DESC}>
              {description}
            </DialogPrimitive.Description>
          ) : null}
          {children ? <div className={MODAL_BODY}>{children}</div> : null}
          {footer ? (
            <div className={cn(MODAL_FOOTER, center && 'sm:justify-center')}>{footer}</div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export { Modal }
