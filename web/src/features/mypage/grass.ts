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

/**
 * 잔디 범위(`from`~`to`, 1년)에서 제출한 달의 수 (디자인 '최근 12개월 중 N개월 활동').
 * 같은 줄의 '총 N일'·잔디와 같은 기간을 센다 — 기간이 다르면 '0개월 활동 · 총 5일'처럼 어긋난다(#274 리뷰).
 * 1년은 달력으로 13달에 걸칠 수 있어 '12개월 중 13개월'이 나오지 않게 12에서 멈춘다.
 */
export function activeMonths(activity: Pick<UserActivity, 'days'>): number {
  // `days`는 그 기간에 제출한 날만 담는다(계약)
  const months = new Set(
    activity.days.filter((day) => day.count > 0).map((day) => day.date.slice(0, 7)),
  )
  return Math.min(months.size, 12)
}

/**
 * 달 이름이 다음 이름과 겹치지 않으려면 떨어져야 하는 주 수. 한 주는 14px(칸 11 + 간격 3)이고
 * '12월'은 11px 글자로 24px쯤이라 두 주면 들어간다.
 */
const LABEL_GAP_WEEKS = 2

/**
 * 주마다 달 이름. 주의 첫 날짜가 앞 주와 다른 달이면 그 달 이름을 붙인다. 맨 앞 주는 범위의
 * 첫 달이다.
 *
 * 맨 앞 주의 이름이 다음 이름과 가까우면 앞 것을 뺀다. 글자가 칸보다 넓어 바로 옆 열의
 * 이름과 포개진다(`from`이 그달 말일 무렵이면 '10월'과 '11월'이 나란히 붙는다). `from`은
 * 매일 바뀌므로 자주 생긴다.
 */
export function monthLabels(weeks: GrassCell[][]): (string | null)[] {
  const monthOf = (week: GrassCell[]) => week.find((cell) => cell.date !== null)?.date?.slice(5, 7)

  const labels = weeks.map((week, i) => {
    const month = monthOf(week)
    if (month === undefined) return null
    if (i > 0 && monthOf(weeks[i - 1]!) === month) return null
    return `${Number(month)}월`
  })

  const next = labels.findIndex((label, i) => i > 0 && label !== null)
  if (labels[0] !== null && next !== -1 && next < LABEL_GAP_WEEKS) labels[0] = null
  return labels
}
