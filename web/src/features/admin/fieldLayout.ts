/**
 * alignAt을 준 Field들을 담는 격자. 줄 간격이 칸 안 간격(6px)이 되므로, 위아래로 쌓이는 좁은
 * 화면에서는 subgrid를 쓰지 않고 칸 사이를 넓게 둔다.
 */
export const ALIGNED_ROW = {
  sm: 'grid gap-4 sm:grid-cols-2 sm:gap-y-1.5',
  md: 'grid gap-4 md:grid-cols-3 md:gap-y-1.5',
} as const
