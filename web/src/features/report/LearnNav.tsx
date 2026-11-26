import { useLayoutEffect, useRef } from 'react'
import { matchPath, NavLink, useLocation, useNavigationType } from 'react-router'

import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

const TAB =
  'relative inline-flex h-10 items-center gap-2 rounded-full px-[18px] text-[15px] font-semibold whitespace-nowrap'

const TABS = [
  { to: '/me/report', icon: 'chart', label: '학습 리포트' },
  { to: '/me/badges', icon: 'trophy', label: '배지' },
] as const

/** 탭을 눌러 넘어올 때 떠난 탭 주소. 알약이 그 자리에서 출발한다 */
interface LearnNavState {
  learnTabFrom?: string
}

/** 내 학습 탭: 학습 리포트 · 배지 (BADGE-02). 오답 노트는 만들지 않기로 했다(#248 댓글). */
export function LearnNav() {
  const { pathname, state } = useLocation()
  // 탭을 눌러 넘어왔을 때(PUSH)만 미끄러진다. 새로고침·뒤로 가기(POP)는 history에 남은 state를 다시 읽는다(#378 리뷰)
  const from =
    useNavigationType() === 'PUSH' ? (state as LearnNavState | null)?.learnTabFrom : undefined
  const navRef = useRef<HTMLElement>(null)
  const pillRef = useRef<HTMLSpanElement>(null)

  // 두 탭은 다른 화면이라 탭 줄도 새로 그려진다. 떠난 탭 자리에 알약을 먼저 놓고 지금 탭으로 옮긴다.
  // 다른 화면에서 들어왔으면(from 없음) 제자리에 바로 놓는다
  useLayoutEffect(() => {
    const nav = navRef.current
    const pill = pillRef.current
    // 지금 탭은 NavLink의 판정을 그대로 쓴다. 주소를 문자열로 비교하면 대소문자만 다른 주소에서 어긋난다(#378 리뷰)
    const current = nav?.querySelector<HTMLElement>('a[aria-current="page"]')
    if (!nav || !pill || !current) return
    const links = nav.querySelectorAll('a')
    const start =
      (from !== undefined && links[TABS.findIndex((tab) => matchPath(tab.to, from))]) || current
    const place = (link: HTMLElement) => {
      pill.style.width = `${link.offsetWidth}px`
      pill.style.transform = `translateX(${link.offsetLeft}px)`
    }
    // 미끄러지지 않고 바로 놓는다. 자리를 확정해야(offsetWidth) 다음에 옮길 때 transition이 다시 걸린다
    const jump = (link: HTMLElement) => {
      pill.style.transition = 'none'
      place(link)
      void pill.offsetWidth
      pill.style.transition = ''
    }
    jump(start)
    place(current)
    // 웹 글꼴이 와서 탭 폭이 달라지면 바로 따라간다. 미끄러지면 탭을 옮긴 것처럼 보인다(#378 리뷰).
    // 처음 observe할 때도 한 번 불리므로 폭이 실제로 바뀌었을 때만 옮긴다. 아니면 막 시작한 미끄러짐이 끊긴다
    const widthsOf = () => Array.from(links, (link) => link.offsetWidth).join()
    let widths = widthsOf()
    const observer = new ResizeObserver(() => {
      if (widthsOf() === widths) return
      widths = widthsOf()
      jump(current)
    })
    // 알약은 offsetWidth(border-box)로 놓으므로 같은 상자를 본다. 기본(content-box)은 여백만 바뀌면 알리지 않는다
    links.forEach((link) => observer.observe(link, { box: 'border-box' }))
    return () => observer.disconnect()
  }, [pathname, from])

  return (
    <nav
      ref={navRef}
      aria-label="내 학습 메뉴"
      className="bg-muted relative inline-flex gap-1 rounded-full p-1"
    >
      <span
        ref={pillRef}
        aria-hidden="true"
        className="bg-card absolute inset-y-1 left-0 rounded-full shadow-[0_1px_3px_rgba(27,33,64,0.12)] transition-[transform,width] duration-300 ease-out motion-reduce:transition-none"
      />
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          state={{ learnTabFrom: pathname } satisfies LearnNavState}
          className={({ isActive }) =>
            cn(
              TAB,
              'transition-colors focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
              isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )
          }
        >
          <Icon name={tab.icon} />
          {tab.label}
        </NavLink>
      ))}
    </nav>
  )
}
