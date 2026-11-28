import { Tooltip as TooltipPrimitive } from 'radix-ui'
import { useRef, useState } from 'react'

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
  // Radix는 pointerdown에서 먼저 닫아, click 때의 open으로는 누르기 전 상태를 알 수 없다
  const openBeforePress = useRef<boolean | null>(null)
  return (
    // 툴팁마다 Provider를 둔다. 앱 전체에 하나 두는 것보다 덜 묶이고, 지연값도 여기 하나뿐이다
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root open={open} onOpenChange={setOpen}>
        <TooltipPrimitive.Trigger
          asChild
          onPointerDownCapture={() => {
            openBeforePress.current = open
          }}
          // 아래 셋은 click 없이 끝나는 누르기다. 터치는 손을 뗀 뒤 click 전에도 pointerleave가
          // 오므로(buttons 0), 누른 채 벗어날 때만 지운다
          onPointerLeave={(event) => {
            if (event.buttons !== 0) openBeforePress.current = null
          }}
          onPointerCancel={() => {
            openBeforePress.current = null
          }}
          onContextMenu={() => {
            openBeforePress.current = null
          }}
          onClick={
            openOnClick
              ? (event) => {
                  // Radix의 '누르면 닫기'를 막고 직접 여닫는다.
                  // 키보드(detail 0)나 보조 기술의 클릭은 pointerdown이 없어 지금 상태를 기준으로 한다
                  event.preventDefault()
                  const before = event.detail === 0 ? null : openBeforePress.current
                  // click만 보내는 보조 기술이나 iOS Safari는 포커스를 옮기지 않는다. 옮겨야 앞서 연
                  // 설명이 blur로 닫힌다. 포커스가 여는 것은 아래 setOpen이 덮는다
                  event.currentTarget.focus()
                  openBeforePress.current = null
                  setOpen(!(before ?? open))
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

export { Tooltip }
