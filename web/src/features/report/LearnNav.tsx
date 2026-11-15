import { NavLink } from 'react-router'

import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

const TAB =
  'inline-flex h-10 items-center gap-2 rounded-full px-[18px] text-[15px] font-semibold whitespace-nowrap'

const TABS = [
  { to: '/me/report', icon: 'chart', label: '학습 리포트' },
  { to: '/me/badges', icon: 'trophy', label: '배지' },
] as const

/** 내 학습 탭: 학습 리포트 · 배지 (BADGE-02). 오답 노트는 만들지 않기로 했다(#248 댓글). */
export function LearnNav() {
  return (
    <nav aria-label="내 학습 메뉴" className="bg-muted inline-flex gap-1 rounded-full p-1">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end
          className={({ isActive }) =>
            cn(
              TAB,
              'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
              isActive
                ? 'bg-card text-foreground shadow-[0_1px_3px_rgba(27,33,64,0.12)]'
                : 'text-muted-foreground hover:text-foreground',
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
