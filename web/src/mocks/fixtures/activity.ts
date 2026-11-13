import type { UserActivity, UserStreak } from '@/api/types'

const DAY_MS = 24 * 60 * 60 * 1000
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

/** 한국 시각 기준 오늘 (계약: 잔디의 날짜는 한국 시각 자정으로 나눈다). */
function kstToday(now: number): string {
  return new Date(now + KST_OFFSET_MS).toISOString().slice(0, 10)
}

function shift(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * 풀이 요약·잔디 목 데이터 (MY-05). 날짜는 오늘에 맞춰 만든다 — 고정 날짜를 두면 며칠 뒤
 * 잔디가 비어 보인다.
 *
 * 1번(코다리)은 맞힌 문제 7개로 학습 통계 fixture와 수를 맞추고, 진하기 다섯 단계가 모두
 * 보이게 제출 수를 돌린다. 그 밖의 사용자(관리자)는 제출이 없는 화면을 보여 준다.
 */
export function activityFor(userId: number, now = Date.now()): UserActivity {
  const to = kstToday(now)
  const from = shift(to, -364)
  if (userId !== 1) {
    return {
      solvedCount: 0,
      wrongCount: 0,
      solvedByDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
      from,
      to,
      days: [],
      totalActiveDays: 0,
    }
  }

  const COUNTS = [1, 3, 0, 5, 0, 0, 7, 2, 0, 1, 0, 4]
  const days = Array.from({ length: 120 }, (_, i) => ({
    date: shift(to, -119 + i),
    count: COUNTS[i % COUNTS.length]!,
  })).filter((day) => day.count > 0)

  return {
    solvedCount: 7,
    wrongCount: 3,
    solvedByDifficulty: { EASY: 4, MEDIUM: 2, HARD: 1 },
    from,
    to,
    days,
    totalActiveDays: days.length,
  }
}

/**
 * 연속 학습 목 데이터 (STREAK-01·02). 1번은 어제까지 3일 이어 왔고 오늘은 아직 제출하지 않은
 * 모양이다 — 카드의 '오늘 한 문제만 풀면' 안내와 빈 오늘 칸이 보인다. 그 밖은 제출이 없다.
 */
export function streakFor(userId: number, now = Date.now()): UserStreak {
  const today = kstToday(now)
  // getUTCDay: 일 0 ~ 토 6. 월요일을 0으로 맞춘다
  const monday = shift(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7))
  const active = (date: string) => userId === 1 && date < today && date >= shift(today, -3)
  return {
    currentStreak: userId === 1 ? 3 : 0,
    activeToday: false,
    today,
    week: Array.from({ length: 7 }, (_, i) => {
      const date = shift(monday, i)
      return { date, active: active(date) }
    }),
  }
}
