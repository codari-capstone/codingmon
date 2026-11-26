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
    pill.style.transition = 'none'
    place(start)
    void pill.offsetWidth // 출발 자리를 확정해야 다음 자리로 옮길 때 transition이 걸린다
    pill.style.transition = ''
    place(current)
    // 웹 글꼴이 오거나 창 폭이 바뀌어 탭 폭이 달라져도 따라간다
    const observer = new ResizeObserver(() => place(current))
    links.forEach((link) => observer.observe(link))
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
