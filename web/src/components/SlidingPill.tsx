import { useLayoutEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

/**
 * 분절형 탭의 흰 알약 (내 학습 탭·Tabs pill·결제 주기). 탭 줄의 첫 자식으로 두면 지금 칸 아래로 미끄러진다.
 * 탭 줄은 `relative`, 칸은 `relative`여야 글자가 알약 위에 놓인다. 위아래 여백은 탭 줄의 p-1에 맞췄다.
 *
 * - 처음 그릴 때는 지금 칸에 바로 놓는다. `start`를 주면 그 칸에서 출발한다(화면이 바뀌어 새로 그려지는 내 학습 탭)
 * - 지금 칸이 바뀌면(`activeSelector`가 가리키는 칸이 달라지면) 미끄러진다
 * - 칸 폭이 바뀌면(웹 글꼴) 바로 따라간다. 미끄러지면 칸을 옮긴 것처럼 보인다(#378 리뷰)
 * - 애니메이션 줄이기면 움직이지 않는다
 */
export function SlidingPill({
  activeSelector,
  start,
  className,
}: {
  /** 지금 칸을 찾는 선택자. 예: `[aria-pressed="true"]` */
  activeSelector: string
  /** 처음 그릴 때 출발할 칸. 없으면 지금 칸에 바로 놓는다 */
  start?: (row: HTMLElement) => HTMLElement | null | undefined
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  // 처음 그릴 때만 읽는다. 바뀔 때마다 효과를 다시 걸면 알약이 출발 칸으로 되돌아간다
  const startRef = useRef(start)

  useLayoutEffect(() => {
    const pill = ref.current
    const row = pill?.parentElement
    if (!pill || !row) return
    const items = () =>
      Array.from(row.children).filter(
        (child): child is HTMLElement => child !== pill && child instanceof HTMLElement,
      )
    const active = () => row.querySelector<HTMLElement>(activeSelector)
    const place = (item: HTMLElement) => {
      pill.style.width = `${item.offsetWidth}px`
      pill.style.transform = `translateX(${item.offsetLeft}px)`
    }
    // 미끄러지지 않고 바로 놓는다. 자리를 확정해야(offsetWidth) 다음에 옮길 때 transition이 다시 걸린다
    const jump = (item: HTMLElement) => {
      pill.style.transition = 'none'
      place(item)
      void pill.offsetWidth
      pill.style.transition = ''
    }

    let current = active()
    if (current) {
      jump(startRef.current?.(row) ?? current)
      place(current)
    }

    // 처음 observe할 때도 한 번 불리므로 폭이 실제로 바뀌었을 때만 옮긴다. 아니면 막 시작한 미끄러짐이 끊긴다.
    // 알약은 offsetWidth(border-box)로 놓으므로 같은 상자를 본다. 기본(content-box)은 여백만 바뀌면 알리지 않는다
    const widthsOf = () =>
      items()
        .map((item) => item.offsetWidth)
        .join()
    let widths = widthsOf()
    const resize = new ResizeObserver(() => {
      if (widthsOf() === widths) return
      widths = widthsOf()
      if (current) jump(current)
    })
    items().forEach((item) => resize.observe(item, { box: 'border-box' }))

    // 지금 칸 표시(aria-current·aria-pressed·data-state)가 바뀌면 옮긴다. 알약 자신의 style 변경도 여기로 오지만
    // 지금 칸이 그대로라 넘어간다
    const select = new MutationObserver(() => {
      const next = active()
      if (next === current) return
      const from = current
      current = next
      if (next) (from ? place : jump)(next)
    })
    select.observe(row, { subtree: true, attributes: true })

    return () => {
      resize.disconnect()
      select.disconnect()
    }
  }, [activeSelector])

  return (
    <span
      ref={ref}
      aria-hidden="true"
      data-slot="sliding-pill"
      className={cn(
        'bg-card absolute inset-y-1 left-0 rounded-full transition-[transform,width] duration-300 ease-out motion-reduce:transition-none',
        className,
      )}
    />
  )
}
