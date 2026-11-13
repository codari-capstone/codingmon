import { NavLink } from 'react-router'

import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'

const TAB =
  'inline-flex h-10 items-center gap-2 rounded-full px-[18px] text-[15px] font-semibold whitespace-nowrap'

/**
 * 내 학습 탭: 학습 리포트 · 배지. 오답 노트는 만들지 않기로 했다(#248 댓글).
 * 배지 화면이 아직 없어 배지 탭은 꺼 두고, #248에서 링크로 바꾼다.
 */
export function LearnNav() {
  return (
    <nav aria-label="내 학습 메뉴" className="bg-muted inline-flex gap-1 rounded-full p-1">
      <NavLink
        to="/me/report"
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
        <Icon name="chart" />
        학습 리포트
      </NavLink>
      <span aria-disabled="true" className={cn(TAB, 'text-muted-foreground opacity-50')}>
        <Icon name="trophy" />
        배지
        <span className="sr-only">(준비 중)</span>
      </span>
    </nav>
  )
}
