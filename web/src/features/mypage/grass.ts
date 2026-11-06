import type { UserActivity } from '@/api/types'

/** 잔디 한 칸. `date`가 null이면 범위 밖이라 그리지 않는 자리다. */
export interface GrassCell {
  date: string | null
  count: number
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 날짜 문자열(`YYYY-MM-DD`)을 UTC 자정으로 읽는다. 계약의 날짜는 이미 한국 시각으로 나뉜
 * 값이라 브라우저 시간대를 거치면 하루가 밀린다(해외에서 보는 경우).
 */
function toUtc(date: string): number {
  return Date.parse(`${date}T00:00:00Z`)
}

function toDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * `from`~`to`를 일요일에 시작하는 주 단위로 자른다. 첫 주의 `from` 앞자리는 빈 칸이다.
 * `days`에는 제출이 있는 날만 오므로(계약) 나머지 날은 0으로 채운다.
 */
export function buildWeeks(activity: Pick<UserActivity, 'from' | 'to' | 'days'>): GrassCell[][] {
  const counts = new Map(activity.days.map((day) => [day.date, day.count]))
  const start = toUtc(activity.from)
  const end = toUtc(activity.to)
  const lead = new Date(start).getUTCDay()

  const weeks: GrassCell[][] = []
  let week: GrassCell[] = Array.from({ length: lead }, () => ({ date: null, count: 0 }))
  for (let ms = start; ms <= end; ms += DAY_MS) {
    const date = toDate(ms)
    week.push({ date, count: counts.get(date) ?? 0 })
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) weeks.push(week)
  return weeks
}

/**
 * 하루 제출 수를 진하기 다섯 단계로 나눈다. 명세에 기준이 없어 정한 값이다
 * (0 / 1 / 2~3 / 4~5 / 6 이상).
 */
export function grassLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0
  if (count === 1) return 1
  if (count <= 3) return 2
  if (count <= 5) return 3
  return 4
}

/** 주의 첫 칸이 그달의 첫 주이면 그 달 이름. 맨 앞 주는 범위의 첫 달이다. */
export function monthLabel(week: GrassCell[], index: number): string | null {
  const first = week.find((cell) => cell.date !== null)?.date
  if (!first) return null
  const day = Number(first.slice(8, 10))
  if (index !== 0 && day > 7) return null
  return `${Number(first.slice(5, 7))}월`
}
