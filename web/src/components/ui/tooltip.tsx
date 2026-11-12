import { Tooltip as TooltipPrimitive } from 'radix-ui'

/**
 * 올리거나 포커스하면 뜨는 한 줄 설명. 감싸는 children은 버튼처럼 포커스할 수 있어야 한다.
 * 꼭 알아야 하는 내용을 넣지 않는다(터치에서는 안 보인다). 아이콘만 있는 버튼은 aria-label도 함께 준다.
 * 말풍선 글은 Radix가 감싼 요소의 aria-describedby로 잇는다.
 */
function Tooltip({
  label,
  side = 'top',
  children,
}: {
  label: React.ReactNode
  side?: 'top' | 'bottom'
  children: React.ReactElement
}) {
  return (
    // 툴팁마다 Provider를 둔다. 앱 전체에 하나 두는 것보다 덜 묶이고, 지연값도 여기 하나뿐이다
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
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
