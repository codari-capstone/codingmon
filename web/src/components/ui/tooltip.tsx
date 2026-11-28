import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { useRef, useState } from 'react'

// 지금 연 말풍선의 상태 설정 함수. openOnClick은 click에서 직접 열어 Radix가 다른 말풍선에 보내는
// 닫기 알림이 나가지 않으므로, 한 번에 하나만 여는 것은 여기서 지킨다
let shown: ((open: boolean) => void) | null = null

/**
 * 올리거나 포커스하면 뜨는 한 줄 설명. 감싸는 children은 버튼처럼 포커스할 수 있어야 한다.
 * 꼭 알아야 하는 내용을 넣지 않는다(openOnClick이 아니면 터치에서는 안 보인다). 아이콘만 있는 버튼은 aria-label도 함께 준다.
 * openOnClick은 설명을 여는 것밖에 할 일이 없는 버튼("?")에만 준다. 누를 때마다 열리고 닫히며, 바깥을 눌러도 닫힌다.
 * 말풍선 글은 Radix가 감싼 요소의 aria-describedby로 잇는다.
 */
function Tooltip({
  label,
  side = 'top',
  openOnClick = false,
  children,
}: {
  label: React.ReactNode
  side?: 'top' | 'bottom'
  openOnClick?: boolean
  children: React.ReactElement
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const change = (next: boolean) => {
    if (next) {
      if (shown !== setOpen) shown?.(false)
      shown = setOpen
    }
    setOpen(next)
  }
  return (
    // 툴팁마다 Provider를 둔다. 앱 전체에 하나 두는 것보다 덜 묶이고, 지연값도 여기 하나뿐이다
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root
        open={open}
        onOpenChange={(next) => {
          // hover로 열리기를 기다리는 사이에 누르면, 누르는 동안 열려 곧바로 click이 닫는다. 그 열기는 버린다
          if (next && openOnClick && isPressed(triggerRef.current)) return
          change(next)
        }}
      >
        {/*
          openOnClick은 누를 때마다 여닫는다. Radix는 누르는 순간(pointerdown) 닫으므로, 열려 있으면
          preventDefault로 막는다(아래 onPointerDownOutside도 같다). 그러면 click 때의 open이 누르기 전
          상태이고, click 없이 끝난 누르기(끌어 놓기·가운데 버튼)는 아무것도 바꾸지 않는다.
          닫는 click은 막지 않고 Radix에 맡긴다. 그래야 남은 hover 열기 타이머도 지워져 다시 열리지 않는다
        */}
        <TooltipPrimitive.Trigger
          ref={triggerRef}
          asChild
          onPointerDown={
            openOnClick
              ? (event) => {
                  if (open) event.preventDefault()
                }
              : undefined
          }
          onFocus={
            openOnClick
              ? (event) => {
                  // 눌러서 생긴 포커스로는 열지 않는다. 터치는 click 직전에 포커스가 와서, 여기서 열면
                  // 이어지는 click이 도로 닫는다. 키보드 포커스는 연다
                  if (!event.currentTarget.matches(':focus-visible')) event.preventDefault()
                }
              : undefined
          }
          onClick={
            openOnClick
              ? (event) => {
                  if (open) {
                    // 위 pointerdown에서 기본 동작을 막아 포커스가 따라오지 않았다. 누른 버튼으로 옮긴다
                    event.currentTarget.focus()
                    return
                  }
                  // 여는 click은 Radix의 '누르면 닫기'를 막는다
                  event.preventDefault()
                  change(true)
                }
              : undefined
          }
        >
          {children}
        </TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            data-slot="tooltip"
            side={side}
            sideOffset={8}
            onPointerDownOutside={(event) => {
              // 트리거는 말풍선 바깥이라 이 길로도 닫힌다
              if (openOnClick && triggerRef.current?.contains(event.target as Node)) {
                event.preventDefault()
              }
            }}
            // 남색 말풍선. 다크는 바탕과 붙어 선을 두르고, 고대비에서는 테두리를 그린다(#257 리뷰)
            className="z-50 max-w-xs rounded-sm bg-inverse px-2.5 py-[7px] text-xs leading-[1.4] font-medium text-inverse-foreground dark:shadow-[inset_0_0_0_1px_var(--inverse-line)] forced-colors:border data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 motion-reduce:animate-none"
          >
            {label}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

/** 마우스나 손가락으로 누르고 있는 중인지 */
function isPressed(element: Element | null): boolean {
  return element?.matches(':active') ?? false
}

export { Tooltip }
