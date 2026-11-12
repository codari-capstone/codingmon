import { CircleAlert, CircleCheck, CircleX, Info, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Toast as ToastPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'

const TONE = {
  success: { Icon: CircleCheck, text: 'text-success-text' },
  danger: { Icon: CircleX, text: 'text-destructive-text' },
  warning: { Icon: CircleAlert, text: 'text-warning-text' },
  info: { Icon: Info, text: 'text-info-text' },
} as const

/**
 * 앱에 하나 둔다. 사라지는 시간(4~6초)은 여기 duration이 기본이고 Toast마다 바꿀 수 있다.
 * 오른쪽으로 밀어 닫는다.
 */
function ToastProvider({
  duration = 5000,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Provider>) {
  return <ToastPrimitive.Provider duration={duration} swipeDirection="right" {...props} />
}

/** 알림이 쌓이는 자리. 화면 오른쪽 아래. 한 번에 셋 넘게 띄우지 않는 것은 쓰는 쪽이 지킨다 */
function ToastViewport({
  className,
  ...props
}: React.ComponentProps<typeof ToastPrimitive.Viewport>) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        'fixed right-4 bottom-4 z-[100] m-0 flex w-[calc(100%-2rem)] max-w-[420px] list-none flex-col gap-2 p-0 outline-hidden sm:w-auto',
        className,
      )}
      label="알림 ({hotkey})"
      {...props}
    />
  )
}

/**
 * 방금 한 동작의 결과를 잠깐 알려 주고 사라지는 알림. 꼭 읽어야 하는 내용은 Alert나 Modal.
 * danger는 스크린 리더가 하던 말을 끊고 바로 읽는다(foreground), 나머지는 차례를 기다린다(background).
 */
function Toast({
  title,
  description,
  tone,
  action,
  className,
  ...props
}: Omit<React.ComponentProps<typeof ToastPrimitive.Root>, 'title'> & {
  title: React.ReactNode
  description?: React.ReactNode
  tone?: keyof typeof TONE
  /** 작은 버튼 하나. 스크린 리더는 label을 대체 글로 읽고 단축키로 갈 수 있다고 안내한다 */
  action?: { label: string; onClick: () => void }
}) {
  const toneStyle = tone ? TONE[tone] : null
  return (
    <ToastPrimitive.Root
      type={tone === 'danger' ? 'foreground' : 'background'}
      className={cn(
        // 경계는 그림자 + 머리카락 선. 고대비에서는 그림자가 지워지니 테두리를 그린다(#257 리뷰)
        'flex w-full items-center gap-3 rounded-lg bg-card py-3 pr-3 pl-4 shadow-[var(--elevation-pop),inset_0_0_0_1px_var(--border)] sm:min-w-[280px] forced-colors:border',
        'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-4 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=cancel]:translate-x-0 data-[swipe=end]:animate-out data-[swipe=end]:translate-x-(--radix-toast-swipe-end-x) motion-reduce:animate-none',
        className,
      )}
      {...props}
    >
      {toneStyle ? (
        <toneStyle.Icon aria-hidden className={cn('size-5 shrink-0', toneStyle.text)} />
      ) : null}
      <div className="min-w-0 flex-1">
        <ToastPrimitive.Title className="m-0 text-sm leading-[1.45] font-bold text-foreground">
          {title}
        </ToastPrimitive.Title>
        {description ? (
          <ToastPrimitive.Description className="m-0 text-[13px] leading-[1.5] text-muted-foreground">
            {description}
          </ToastPrimitive.Description>
        ) : null}
      </div>
      {action ? (
        <ToastPrimitive.Action asChild altText={action.label}>
          <Button variant="ghost" size="sm" onClick={action.onClick}>
            {action.label}
          </Button>
        </ToastPrimitive.Action>
      ) : null}
      <ToastPrimitive.Close asChild>
        <Button variant="ghost" size="sm" shape="circle" aria-label="알림 닫기">
          <X aria-hidden />
        </Button>
      </ToastPrimitive.Close>
    </ToastPrimitive.Root>
  )
}

export { Toast, ToastProvider, ToastViewport }
