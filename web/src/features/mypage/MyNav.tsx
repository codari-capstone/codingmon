import { NavLink } from 'react-router'

import type { CurrentUser } from '@/api/types'
import { Avatar } from '@/components/ui/avatar'
import { Icon, type IconName } from '@/components/ui/icon'
import { useLogout } from '@/features/auth/useLogout'
import { cn } from '@/lib/utils'

const ITEM =
  'flex h-11 items-center gap-3 rounded-[12px] px-3.5 text-[15px] font-semibold transition-colors focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2'
const IDLE = 'text-body-foreground hover:bg-muted hover:text-foreground'

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground px-3.5 pb-1.5 text-xs font-semibold">{title}</span>
      {children}
    </div>
  )
}

/**
 * 같은 화면 안의 구역으로 간다. shortcut: 계정 설정·탈퇴는 아직 /me 아래에 있어(#240) 앵커로 잇는다.
 * #243에서 /me/account·/me/withdraw가 생기면 NavLink로 바꾼다.
 */
function Anchor({
  href,
  icon,
  label,
  danger,
}: {
  href: string
  icon: IconName
  label: string
  danger?: boolean
}) {
  return (
    <a href={href} className={cn(ITEM, danger ? 'text-destructive-text hover:bg-muted' : IDLE)}>
      <Icon name={icon} />
      {label}
    </a>
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
        <NavLink
          to="/me"
          end
          className={({ isActive }) => cn(ITEM, isActive ? 'bg-accent text-primary-text' : IDLE)}
        >
          <Icon name="user" />
          프로필 · 학습 요약
        </NavLink>
      </Group>

      <Group title="설정">
        <Anchor href="#account-settings" icon="lock" label="계정 설정" />
        {/* 화면 설정(UX-06)은 #243·#249에서 생긴다. 그때까지 꺼 둔다 */}
        <span aria-disabled="true" className={cn(ITEM, 'text-muted-foreground opacity-50')}>
          <Icon name="settings" />
          화면 설정
          <span className="sr-only">(준비 중)</span>
        </span>
      </Group>

      {/* 관리자는 탈퇴할 수 없다(WithdrawSection이 그리지 않는다). 갈 곳 없는 메뉴를 두지 않는다 */}
      {user.role !== 'ADMIN' ? (
        <Group title="계정 관리">
          <Anchor href="#withdraw" icon="x" label="회원 탈퇴" danger />
        </Group>
      ) : null}

      <div className="bg-border mx-1.5 h-px" />
      <button
        type="button"
        onClick={logout}
        disabled={isPending}
        className={cn(ITEM, 'text-muted-foreground hover:bg-muted hover:text-foreground text-left')}
      >
        <Icon name="logout" />
        로그아웃
      </button>
    </nav>
  )
}
