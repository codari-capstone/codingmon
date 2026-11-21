import { useLayoutEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router'

import type { CurrentUser } from '@/api/types'
import { Avatar } from '@/components/ui/avatar'
import { Icon, type IconName } from '@/components/ui/icon'
import { useLogout } from '@/features/auth/useLogout'
import { cn } from '@/lib/utils'

const ITEM =
  'flex h-11 shrink-0 items-center gap-3 rounded-[12px] px-3.5 text-[15px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2'
// 마이페이지 바탕이 옅은 면(bg-muted, AppShell의 subtle)이라 hover는 카드 면으로 띄운다(#274 리뷰)
const HOVER = 'hover:bg-card'
const IDLE = cn('text-body-foreground hover:text-foreground', HOVER)

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // lg 미만에서는 묶음을 풀어 메뉴만 가로 한 줄에 놓는다
    <div className="flex flex-col gap-1 max-lg:contents">
      <span className="text-muted-foreground px-3.5 pb-1.5 text-xs font-semibold max-lg:hidden">
        {title}
      </span>
      {children}
    </div>
  )
}

/** 메뉴 하나. 지금 화면이면 옅은 파랑 면(aria-current). 탈퇴는 빨간 글자다(디자인 MyNav) */
function Item({
  to,
  icon,
  label,
  danger,
}: {
  to: string
  icon: IconName
  label: string
  danger?: boolean
}) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) =>
        cn(
          ITEM,
          isActive
            ? 'bg-accent text-primary-text'
            : danger
              ? cn('text-destructive-text', HOVER)
              : IDLE,
        )
      }
    >
      <Icon name={icon} className="max-lg:hidden" />
      {label}
    </NavLink>
  )
}

/**
 * 마이페이지 왼쪽 메뉴 (디자인 MyNav): 내 정보 · 설정 · 계정 관리 · 로그아웃.
 * lg 미만에서는 본문 위에 통째로 펼쳐지면 본문이 한 화면 넘게 밀려(#341) 메뉴만 가로 한 줄 탭으로 둔다.
 * 프로필·묶음 제목·아이콘은 빼고, 로그아웃은 상단 바 사용자 메뉴에도 있어 뺀다. 넘치면 가로로 민다.
 */
export function MyNav({ user }: { user: CurrentUser }) {
  const { logout, isPending } = useLogout()
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  // 가로 탭이 넘칠 때 지금 탭을 가운데로 민다. 오른쪽 탭(화면 설정 등)에 들어가면 절반쯤 잘려 보였다.
  // scrollIntoView는 문서까지 세로로 밀 수 있어 탭 줄의 scrollLeft만 바꾼다. 세로 메뉴(lg 이상)는 넘치지 않아 그대로다
  useLayoutEffect(() => {
    const nav = navRef.current
    const active = nav?.querySelector('[aria-current="page"]')
    if (!nav || !active) return
    const center = () => {
      if (nav.scrollWidth <= nav.clientWidth) return
      const navBox = nav.getBoundingClientRect()
      const box = active.getBoundingClientRect()
      nav.scrollLeft += box.left - navBox.left - (navBox.width - box.width) / 2
    }
    center()
    // 같은 주소에서 탭 줄이 좁아지거나(회전·창 크기) 웹 글꼴이 와서 탭 폭이 바뀌어도 다시 민다(#351 리뷰).
    // 앞쪽 탭만 넓어져도 지금 탭이 밀리므로 탭 전부를 본다
    const observer = new ResizeObserver(center)
    observer.observe(nav)
    nav.querySelectorAll('a').forEach((tab) => observer.observe(tab))
    return () => observer.disconnect()
  }, [pathname])

  return (
    <nav
      ref={navRef}
      aria-label="마이페이지 메뉴"
      // 바탕이 옅은 면(bg-muted)이라 그라데이션 덮개도 그 색이다. p-1은 포커스 테두리가 잘리지 않게 둔다
      className="flex flex-col gap-5 max-lg:scroll-fade-x max-lg:flex-row max-lg:gap-1 max-lg:overflow-x-auto max-lg:p-1 max-lg:[--fade-bg:var(--muted)]"
    >
      <div className="flex items-center gap-3 px-1.5 py-1 max-lg:hidden">
        <Avatar src={user.avatarUrl ?? undefined} name={user.nickname} size={44} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-foreground truncate font-bold">{user.nickname}</span>
          {/* GitHub 가입자는 이메일이 없다(계약). 그 자리에 GitHub 아이디를 둔다 */}
          {(user.email ?? user.githubUsername) ? (
            <span className="text-muted-foreground truncate text-[13px]">
              {user.email ?? user.githubUsername}
            </span>
          ) : null}
        </div>
      </div>

      <Group title="내 정보">
        <Item to="/me" icon="user" label="프로필 · 학습 요약" />
      </Group>

      <Group title="설정">
        <Item to="/me/account" icon="lock" label="계정 설정" />
        <Item to="/me/display" icon="settings" label="화면 설정" />
      </Group>

      {/* 관리자는 탈퇴할 수 없다(명세 MY-04, 서버도 403). 갈 곳 없는 메뉴를 두지 않는다 */}
      {user.role !== 'ADMIN' ? (
        <Group title="계정 관리">
          <Item to="/me/withdraw" icon="x" label="회원 탈퇴" danger />
        </Group>
      ) : null}

      <div className="bg-border mx-1.5 h-px max-lg:hidden" />
      <button
        type="button"
        onClick={logout}
        disabled={isPending}
        className={cn(
          ITEM,
          'text-muted-foreground hover:text-foreground text-left max-lg:hidden',
          HOVER,
        )}
      >
        <Icon name="logout" />
        로그아웃
      </button>
    </nav>
  )
}
