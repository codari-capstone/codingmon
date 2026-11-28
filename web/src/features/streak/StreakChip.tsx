import { Link } from 'react-router'

import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useStreak } from './streakQuery'

/** 상단 바 연속 학습 칩 (STREAK-02). 비로그인은 0일(명세). 숫자를 모르는 동안은 자리만 잡는다. */
export function StreakChip() {
  const { streak, guest, loading, sessionLoading } = useStreak()
  const count = guest ? 0 : streak?.currentStreak
  if (count === undefined) {
    // 받는 동안 비워 두면 응답이 오는 순간 칩 폭만큼 테마 버튼이 밀린다. 사용자 메뉴 자리표시와 같은
    // 이유로 한 자리 칩의 폭을 잡아 둔다(#279 리뷰). 세션을 모르는 동안은 비로그인일 수도 있어
    // 0일 칩처럼 sm부터만 잡는다. 받지 못했으면(오류) 자리도 두지 않는다 — 카드가 이유를 말한다.
    if (!loading) return null
    return (
      <span
        aria-hidden="true"
        className={cn('h-[34px] w-[62px] shrink-0', sessionLoading ? 'hidden sm:block' : 'block')}
      />
    )
  }
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
