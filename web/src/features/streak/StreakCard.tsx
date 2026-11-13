import type { UserStreak } from '@/api/types'
import scene from '@/assets/scenes/streak.png'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { cn } from '@/lib/utils'
import { useStreak } from './streakQuery'

/** `week`는 월요일부터 7칸이다(계약). 비로그인은 날짜 없이 이 이름만 둔다. */
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']

function guide(streak: UserStreak | undefined, guest: boolean): string | null {
  if (guest) return '로그인하고 문제를 제출하면 연속 학습이 시작돼요.'
  if (!streak) return null
  if (streak.activeToday) return '오늘도 이어 갔어요. 내일도 한 문제 풀어 봐요.'
  if (streak.currentStreak > 0) {
    return `오늘 한 문제만 풀면 ${streak.currentStreak + 1}일이 돼요.`
  }
  return '오늘 한 문제를 풀면 1일째가 시작돼요.'
}

/** 문제 목록 위 연속 학습 카드 (STREAK-01). 오늘 아직 제출하지 않았으면 오늘 칸이 빈다. */
export function StreakCard() {
  const { streak, guest } = useStreak()
  const count = guest ? 0 : streak?.currentStreak
  const days = DAY_LABELS.map((label, i) => {
    const day = streak?.week[i]
    // 비로그인은 day가 없다. undefined끼리 같다고 보면 일곱 칸이 모두 오늘이 된다
    return {
      label,
      active: day?.active ?? false,
      today: day !== undefined && day.date === streak?.today,
    }
  })

  return (
    <Card
      as="section"
      tone="inverse"
      padding="lg"
      aria-label="연속 학습"
      // 320px 폭에서 달력 7칸이 들어가도록 좁은 화면은 여백·칸을 줄인다 (e2e problems.spec)
      className="flex items-center gap-6 rounded-[28px] p-5 sm:p-8"
    >
      <img
        src={scene}
        alt=""
        width={170}
        height={150}
        className="hidden h-auto shrink-0 sm:block"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <div className="flex flex-col gap-1">
          <p className="text-inverse-accent text-eyebrow">연속 학습</p>
          {/* 로그인했는데 아직 숫자를 모르면 0일로 그리지 않는다 */}
          <p className="text-[28px] leading-tight font-bold tracking-[-0.02em]">
            <span className="text-highlight tabular-nums">{count ?? '–'}일</span>째
            {count ? ' 이어 가는 중' : null}
          </p>
          <p className="text-inverse-muted min-h-[1.5em] text-sm">{guide(streak, guest)}</p>
        </div>
        <ol
          aria-label="이번 주"
          className="m-0 grid max-w-md list-none grid-cols-7 gap-1 p-0 sm:gap-1.5"
        >
          {days.map((day) => (
            <li key={day.label} className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex size-7 items-center sm:size-8 justify-center rounded-full',
                  day.active
                    ? 'bg-highlight text-highlight-foreground'
                    : 'bg-inverse-raised text-inverse-muted',
                  day.today && 'shadow-[inset_0_0_0_2px_var(--highlight)]',
                )}
              >
                <Icon name={day.active ? 'check' : 'flame'} size={16} />
              </span>
              <span
                className={cn(
                  'text-xs font-semibold',
                  day.today ? 'text-highlight' : 'text-inverse-muted',
                )}
              >
                {day.today ? '오늘' : day.label}
                <span className="sr-only">{day.active ? ' 제출함' : ' 제출 안 함'}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>
    </Card>
  )
}
