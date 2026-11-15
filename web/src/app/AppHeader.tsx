import { Link, matchPath, useLocation, useMatch } from 'react-router'

import wordmark from '@/assets/brand/codingmon_wordmark.png'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth/useAuth'
import { useLogout } from '@/features/auth/useLogout'
import { StreakChip } from '@/features/streak/StreakChip'

const MENU: { to: string; label: string; also?: string }[] = [
  { to: '/problems', label: '문제' },
  { to: '/submissions', label: '제출 기록' },
  // 배지 화면도 내 학습 탭(LearnNav)의 한 칸이라 함께 켠다 (BADGE-02)
  { to: '/me/report', label: '내 학습', also: '/me/badges' },
]

/** 학습자 화면에서 ADMIN에게만 더 보이는 입구 (COM-05). */
const ADMIN_ENTRY = { to: '/admin', label: '관리자' }

/**
 * 관리자 화면(/admin 아래)의 메뉴 (ADM-10). 디자인은 대시보드·문제·회원·신고(숫자)·태그다.
 * 아직 없는 화면의 메뉴는 그 화면 이슈에서 더한다.
 */
const ADMIN_MENU = [{ to: '/admin', label: '문제' }]

/** COM-01 상단 바. 로그인 상태는 useAuth만 본다. */
export function AppHeader() {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const inAdmin = useMatch('/admin/*') !== null
  const { logout } = useLogout()
  const isAdmin = user?.role === 'ADMIN'
  // /admin 아래에 남는 사람은 ADMIN뿐이다(아니면 /forbidden으로 간다). 세션을 모르는 동안에도
  // 관리자 메뉴를 두어야 새로고침 때 학습자 메뉴 3개 -> 1개로 흔들리지 않는다.
  const menu: typeof MENU =
    inAdmin && (isAdmin || isLoading) ? ADMIN_MENU : isAdmin ? [...MENU, ADMIN_ENTRY] : MENU
  // 로그인 화면에서 넘어왔다면 그 화면이 들고 있던 돌아갈 주소를 이어 준다. 아니면 지금 주소.
  // 값은 로그인 화면의 safeRedirect가 검사하므로 여기서는 거르지 않는다.
  const from =
    (location.state as { from?: unknown } | null)?.from ?? `${location.pathname}${location.search}`

  return (
    <header className="bg-card border-border border-b">
      {/*
        줄이 넘어가는 좁은 폭(sm 미만)에서만 py-2를 둔다. h-topbar로 높이를 고정하면 flex-wrap으로
        내려간 줄이 박스 밖으로 넘친다 (e2e layout.spec).
        box-content: 내용 폭 1200px에 좌우 24px을 더한다 (페이지 폭 규칙).
      */}
      <div className="max-w-content min-h-topbar mx-auto box-content flex flex-wrap items-center gap-x-7 gap-y-2 px-6 py-2 sm:py-0">
        <Link to="/" className="flex shrink-0 items-center">
          {/* 로고는 그림 그대로 쓴다. 글자로 다시 쓰지 않는다 */}
          <img
            src={wordmark}
            alt="Codingmon"
            width={146}
            height={40}
            className="block h-10 w-auto"
          />
        </Link>

        {/*
          flex-auto(= flex: 1 1 auto)여야 한다. flex-1은 basis가 0%라 줄바꿈 계산에서
          폭이 0으로 취급돼 줄을 넘기지 않고, min-w-0이나 overflow-x-auto가 붙으면
          좁은 화면에서 메뉴가 조용히 잘린다. basis가 auto면 들어갈 자리가 없을 때
          nav 전체가 둘째 줄로 내려간다 (UX-05). 그 줄에도 다 들어가지 않으면(320px의 ADMIN 4개)
          nav 안에서 링크 단위로 한 번 더 줄을 바꾼다. 링크 글자는 끊지 않는다.
        */}
        <nav aria-label="주요 메뉴" className="flex flex-auto flex-wrap gap-1">
          {menu.map((item) => {
            // NavLink는 aria-current를 자기 주소에만 붙인다. `also`까지 같은 규칙(구간 단위 앞부분 일치)으로
            // 직접 가려 색과 화면 낭독기의 '현재 페이지'가 함께 가게 한다(#248 리뷰)
            const active = [item.to, item.also].some(
              (path) => path && matchPath({ path, end: false }, location.pathname),
            )
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`text-label whitespace-nowrap hover:bg-muted hover:text-foreground focus-visible:outline-ring inline-flex h-10 items-center rounded-full px-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  active ? 'bg-muted text-foreground' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          {/* 관리자 화면 시안의 상단 바에는 칩이 없다 */}
          {inAdmin ? null : <StreakChip />}

          {isLoading ? (
            /*
              세션을 모르는 동안 자리만 잡는다. 아무것도 두지 않으면 화면을 불러올 때마다
              로그인 버튼 -> 사용자 메뉴로 바뀌며 헤더 폭이 크게 흔들린다. 높이는 버튼 높이,
              폭은 사용자 메뉴(아바타 + 짧은 닉네임)에 가깝게 잡은 값이다. 무엇으로 바뀔지
              모르므로 정확히 맞출 수는 없다.
            */
            <div aria-hidden="true" className="h-control-sm w-24 shrink-0" />
          ) : isAuthenticated && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="px-1 sm:pr-3.5"
                  aria-label={`사용자 메뉴 · ${user.nickname}`}
                >
                  <Avatar name={user.nickname} size={32} />
                  <span className="hidden sm:inline">{user.nickname}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{user.nickname}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* 순서는 명세 COM-01: 마이페이지·내 학습·로그아웃 */}
                <DropdownMenuItem asChild>
                  <Link to="/me">마이페이지</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/me/report">내 학습</Link>
                </DropdownMenuItem>
                {/* 디자인 시스템 Menu: 로그아웃은 구분선 뒤 맨 아래에 위험 항목으로 */}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="danger" onSelect={logout}>
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Button asChild variant="secondary" size="sm">
                {/*
                  돌아갈 주소를 함께 보낸다. 싣지 않으면 로그인한 뒤 기본 목적지(/problems)로 가서
                  보고 있던 검색·필터가 사라진다 — COM-07은 '원래 보던 페이지로 돌아감'이다.
                  가입도 같은 주소를 싣는다. 가입 화면이 그 값을 로그인 화면으로 넘긴다.
                */}
                <Link to="/login" state={{ from }}>
                  로그인
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/signup" state={{ from }}>
                  무료로 시작하기
                </Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}
