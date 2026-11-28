const DATE_PARTS = { month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const
const THIS_YEAR = new Intl.DateTimeFormat('ko-KR', DATE_PARTS)
const OTHER_YEAR = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', ...DATE_PARTS })

/** 디자인은 연도 없이 짧게 적는다. 올해가 아닌 제출만 연도를 붙여 지난해 같은 날과 가른다. */
export function formatSubmittedAt(iso: string, now = new Date()) {
  const at = new Date(iso)
  // format은 잘못된 날짜에 RangeError를 던져 화면 전체가 오류로 바뀐다. 그 칸만 비운다
  if (Number.isNaN(at.getTime())) return '—'
  return (at.getFullYear() === now.getFullYear() ? THIS_YEAR : OTHER_YEAR).format(at)
}
