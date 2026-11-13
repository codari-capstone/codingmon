import { NavLink } from 'react-router'

import type { CurrentUser } from '@/api/types'
import { Avatar } from '@/components/ui/avatar'
import { Icon, type IconName } from '@/components/ui/icon'
import { useLogout } from '@/features/auth/useLogout'
import { cn } from '@/lib/utils'

const ITEM =
  'flex h-11 items-center gap-3 rounded-[12px] px-3.5 text-[15px] font-semibold transition-colors focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2'
// 마이페이지 바탕이 옅은 면(bg-muted, AppShell의 subtle)이라 hover는 카드 면으로 띄운다(#274 리뷰)
const HOVER = 'hover:bg-card'
const IDLE = cn('text-body-foreground hover:text-foreground', HOVER)

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground px-3.5 pb-1.5 text-xs font-semibold">{title}</span>
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
      <Icon name={icon} />
      {label}
    </NavLink>
  )
}

/** 마이페이지 왼쪽 메뉴 (디자인 MyNav): 내 정보 · 설정 · 계정 관리 · 로그아웃. */
export function MyNav({ user }: { user: CurrentUser }) {
  const { logout, isPending } = useLogout()
  return (
    <nav aria-label="마이페이지 메뉴" className="flex flex-col gap-5">
      <div className="flex items-center gap-3 px-1.5 py-1">
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

      <div className="bg-border mx-1.5 h-px" />
      <button
        type="button"
        onClick={logout}
        disabled={isPending}
        className={cn(ITEM, 'text-muted-foreground hover:text-foreground text-left', HOVER)}
      >
        <Icon name="logout" />
        로그아웃
      </button>
    </nav>
  )
}
