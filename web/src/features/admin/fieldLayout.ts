/**
 * alignAt을 준 Field들을 담는 격자. 나란히 놓이는 폭부터 줄 간격을 0으로 둔다 — 칸 안 6px은 Field가
 * 여백으로 준다(오류 줄이 비면 그 간격도 없게, #289 리뷰). 위아래로 쌓이는 좁은 화면은 칸 사이를 넓게 둔다.
 */
export const ALIGNED_ROW = {
  sm: 'grid gap-4 sm:grid-cols-2 sm:gap-y-0',
  md: 'grid gap-4 md:grid-cols-3 md:gap-y-0',
} as const
