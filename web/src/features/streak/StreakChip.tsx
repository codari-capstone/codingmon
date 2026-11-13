import { Link } from 'react-router'

import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useStreak } from './streakQuery'

/** 상단 바 연속 학습 칩 (STREAK-02). 비로그인은 0일(명세). 숫자를 모르는 동안은 두지 않는다. */
export function StreakChip() {
  const { streak, guest } = useStreak()
  const count = guest ? 0 : streak?.currentStreak
  if (count === undefined) return null
  return (
    <Link
      to="/problems"
      aria-label={`${count}일 연속 학습 중`}
      title={`${count}일 연속 학습 중`}
      // 비로그인은 옆에 로그인·가입 버튼이 있어 320px에서 상단 바가 넘친다. 좁은 화면에서는 0일 칩을 뺀다
      className={cn(
        guest ? 'hidden sm:inline-flex' : 'inline-flex',
        'bg-warning-soft text-warning-text focus-visible:outline-ring h-[34px] shrink-0 items-center gap-1.5 rounded-full pr-3 pl-2.5 text-sm font-bold focus-visible:outline-2 focus-visible:outline-offset-2',
      )}
    >
      <Icon name="flame" size={16} />
      {/* 숫자와 '일'을 한 덩이로 둔다. 따로 두면 flex gap이 둘 사이를 벌린다 */}
      <span className="tabular-nums">{count}일</span>
    </Link>
  )
}
