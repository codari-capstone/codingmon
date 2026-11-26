import { useQuery } from '@tanstack/react-query'
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
import { unresolvedReportCountQuery } from '@/features/admin/adminReportQuery'
import { useAuth } from '@/features/auth/useAuth'
import { useLogout } from '@/features/auth/useLogout'
import { cn } from '@/lib/utils'
import { StreakChip } from '@/features/streak/StreakChip'
import { MENU, type MenuItem } from './menu'

/** 학습자 화면에서 ADMIN에게만 더 보이는 입구 (COM-05). 관리자 첫 화면은 대시보드다 */
const ADMIN_ENTRY = { to: '/admin/dashboard', label: '관리자' }

/**
 * 관리자 화면(/admin 아래)의 메뉴 (ADM-10). 디자인은 대시보드·문제·회원·신고(숫자)·태그다.
 * 아직 없는 화면의 메뉴는 그 화면 이슈에서 더한다.
 */
const ADMIN_MENU: MenuItem[] = [
  { to: '/admin/dashboard', label: '대시보드' },
  // 문제 관리는 /admin 자체다. 앞부분 일치로 두면 /admin/tags에서도 켜진다
  { to: '/admin', label: '문제', end: true, also: '/admin/problems' },
  { to: '/admin/members', label: '회원' },
  { to: '/admin/reports', label: '신고' },
  { to: '/admin/tags', label: '태그' },
]

/** COM-01 상단 바. 로그인 상태는 useAuth만 본다. */
export function AppHeader({ wide = false }: { wide?: boolean }) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const location = useLocation()
  const inAdmin = useMatch('/admin/*') !== null
  const { logout } = useLogout()
  const isAdmin = user?.role === 'ADMIN'
  // /admin 아래에 남는 사람은 ADMIN뿐이다(아니면 /forbidden으로 간다). 세션을 모르는 동안에도
  // 관리자 메뉴를 두어야 새로고침 때 학습자 메뉴 4개 -> 1개로 흔들리지 않는다.
  const menu: MenuItem[] =
    inAdmin && (isAdmin || isLoading) ? ADMIN_MENU : isAdmin ? [...MENU, ADMIN_ENTRY] : MENU
  // 관리자 메뉴가 보일 때만 센다. 학습자가 부르면 403이다
  const { data: unresolved } = useQuery({
    ...unresolvedReportCountQuery(),
    enabled: inAdmin && isAdmin,
  })
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
        본문이 넓은 화면(wide)이면 상단 바도 같은 폭이다. 다르면 로고와 본문 왼쪽 끝이 어긋난다(#327).
      */}
      <div
        className={cn(
          wide ? 'max-w-wide' : 'max-w-content',
          'min-h-topbar mx-auto box-content flex flex-wrap items-center gap-x-3 gap-y-2 px-6 py-2 sm:gap-x-7 sm:py-0',
        )}
      >
        <Link to="/" className="flex shrink-0 items-center">
          {/* 로고는 그림 그대로 쓴다. 글자로 다시 쓰지 않는다 */}
          <img
            src={wordmark}
            alt="Codingmon"
            width={146}
            height={40}
            className="block h-8 w-auto sm:h-10"
          />
        </Link>

        {/*
          flex-auto(= flex: 1 1 auto)여야 한다. flex-1은 basis가 0%라 줄바꿈 계산에서
          폭이 0으로 취급돼 줄을 넘기지 않고, min-w-0이나 overflow-x-auto가 붙으면
          좁은 화면에서 메뉴가 조용히 잘린다. basis가 auto면 들어갈 자리가 없을 때
          nav 전체가 둘째 줄로 내려간다 (UX-05). 그 줄에도 다 들어가지 않으면(320px의 ADMIN 5개)
          nav 안에서 링크 단위로 한 번 더 줄을 바꾼다. 링크 글자는 끊지 않는다.
          sm 미만에서는 nav를 맨 뒤 한 줄(basis-full)로 보내 오른쪽 버튼들이 로고 줄에 남는다. 그러지 않으면
          로고 / 메뉴 / 버튼이 세 줄로 쌓인다(#341). 메뉴를 가로 스크롤로 숨기지는 않는다(위 UX-05).
        */}
        <nav
          aria-label="주요 메뉴"
          className="flex flex-auto flex-wrap gap-1 max-sm:order-last max-sm:basis-full"
        >
          {menu.map((item) => {
            // NavLink는 aria-current를 자기 주소에만 붙인다. `also`까지 같은 규칙(구간 단위 앞부분 일치)으로
            // 직접 가려 색과 화면 낭독기의 '현재 페이지'가 함께 가게 한다(#248 리뷰)
            const active =
              matchPath({ path: item.to, end: item.end ?? false }, location.pathname) !== null ||
              (item.also !== undefined &&
                matchPath({ path: item.also, end: false }, location.pathname) !== null)
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`text-label whitespace-nowrap hover:bg-muted hover:text-foreground focus-visible:outline-ring inline-flex h-10 sm:px-3.5 items-center rounded-full px-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  active ? 'bg-muted text-foreground' : 'text-muted-foreground'
                }`}
              >
                {item.label}
                {item.to === '/admin/reports' && unresolved ? (
                  // 처리 안 한 신고 수 (ADM-10, 시안 Header). 숫자만 읽히면 뜻을 모르니 화면 낭독기에는 말로 준다
                  <>
                    <span
                      aria-hidden="true"
                      className="bg-destructive text-destructive-foreground ml-1.5 inline-flex h-5 items-center rounded-full px-[7px] text-xs font-bold tabular-nums"
                    >
                      {unresolved}
                    </span>
                    <span className="sr-only">, 처리 안 한 신고 {unresolved}건</span>
                  </>
                ) : null}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2.5">
          {/*
            sm 미만의 로그인 사용자는 테마 버튼을 뺀다. 320px에서 칩·아바타까지 로고 줄에 넣으면 넘쳐 세 줄이 되고,
            세션을 확인하는 동안(두 줄)과 높이가 달라 본문이 흔들린다(#348 리뷰). 테마는 마이페이지 화면 설정에서 바꾼다.
            비로그인은 화면 설정이 없어 그대로 둔다.
            세션을 확인하는 동안에도 뺀다. 보였다가 로그인으로 확인되며 빠지면 그 자리에 칩이 들어와, 그 순간 누른
            사람은 테마 대신 /problems로 간다(#348 리뷰). 불러오는 동안 이 자리에는 누를 수 없는 자리표시만 있다.
          */}
          <span className={cn('contents', (isAuthenticated || isLoading) && 'max-sm:hidden')}>
            <ThemeToggle />
          </span>
          {/* 관리자 화면 시안의 상단 바에는 칩이 없다 */}
          {inAdmin ? null : <StreakChip />}

          {isLoading ? (
            /*
              세션을 모르는 동안 자리만 잡는다. 아무것도 두지 않으면 화면을 불러올 때마다
              로그인 버튼 -> 사용자 메뉴로 바뀌며 헤더 폭이 크게 흔들린다. 높이는 버튼 높이,
              폭은 사용자 메뉴(아바타 + 짧은 닉네임)에 가깝게 잡은 값이다. 무엇으로 바뀔지
              모르므로 정확히 맞출 수는 없다.
              sm 미만에서는 닉네임이 숨고 가입 버튼도 빠져 로그인 버튼(약 80px)이 가장 넓다. w-24(96px)면
              320px에서 로고 줄을 넘쳐 불러오는 동안만 세 줄이 됐다가 두 줄로 줄어든다(#348 리뷰)
            */
            <div aria-hidden="true" className="h-control-sm w-24 shrink-0 max-sm:w-20" />
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
              {/* sm 미만에서는 로고 줄에 들어가지 않아 뺀다. 가입은 로그인 화면과 첫 화면에서 갈 수 있다(#341) */}
              <Button asChild size="sm" className="max-sm:hidden">
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
