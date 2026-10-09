import { Link, NavLink } from 'react-router'

import { ThemeToggle } from '@/components/ThemeToggle'
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

const MENU = [
  { to: '/problems', label: '문제' },
  { to: '/submissions', label: '제출 기록' },
  { to: '/me/report', label: '내 학습' },
]

/** COM-01 상단 내비게이션. 로그인 상태는 useAuth만 본다. */
export function AppHeader() {
  const { user, isAuthenticated } = useAuth()

  return (
    <header className="border-border border-b">
      <div className="mx-auto flex min-h-14 max-w-7xl flex-wrap items-center gap-7 px-6">
        <Link to="/problems" className="flex shrink-0 items-center gap-2 font-bold tracking-tight">
          <span
            aria-hidden="true"
            className="bg-primary text-primary-foreground flex size-6 items-center justify-center rounded-md text-xs font-bold"
          >
            C
          </span>
          Codari
        </Link>

        <nav
          aria-label="주요 메뉴"
          className="flex min-w-0 flex-1 gap-5 overflow-x-auto text-sm whitespace-nowrap"
        >
          {MENU.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? 'text-foreground font-medium' : 'text-muted-foreground'
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <ThemeToggle />

        {isAuthenticated && user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" aria-label={`사용자 메뉴 · ${user.nickname}`}>
                <span className="bg-primary/15 text-primary flex size-6 items-center justify-center rounded-full text-xs font-bold">
                  {user.nickname.slice(0, 1)}
                </span>
                <span className="hidden sm:inline">{user.nickname}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{user.nickname}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/me/report">내 학습</Link>
              </DropdownMenuItem>
              <DropdownMenuItem>로그아웃</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild size="sm" className="min-h-11">
            <Link to="/login">로그인</Link>
          </Button>
        )}
      </div>
    </header>
  )
}
