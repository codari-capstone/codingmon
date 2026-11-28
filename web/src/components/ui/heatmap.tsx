import { cn } from '@/lib/utils'

/** 0은 옅은 면, 1~4는 파랑 28·52·78·100% (카드 위 색 섞기). 파랑 외의 색으로 칠하지 않는다. */
const LEVEL = [
  'bg-muted dark:bg-border',
  'bg-[color-mix(in_srgb,var(--primary)_28%,var(--card))]',
  'bg-[color-mix(in_srgb,var(--primary)_52%,var(--card))]',
  'bg-[color-mix(in_srgb,var(--primary)_78%,var(--card))]',
  'bg-primary',
] as const

const CELL = 'inline-block size-3.5 rounded-[4px]'

interface HeatmapProps {
  /** 날짜순 숫자. 위에서 아래로 7칸씩 한 주 */
  values: number[]
  /** 가장 진한 칸의 기준. 기본은 values의 최댓값 */
  max?: number
  /** 칸마다 날짜·개수 설명 */
  titles?: string[]
  /** 그림 전체의 대체 글자 */
  label?: string
  /** 범례를 뺄 때 false */
  legend?: boolean
  className?: string
}

/** 날마다 얼마나 풀었는지를 칸의 진하기로 보여 주는 학습 잔디. 정확한 숫자를 읽어야 하면 표나 StatCard를 함께 둔다. */
export function Heatmap({
  values,
  max = Math.max(...values, 1),
  titles,
  label = '학습 기록',
  legend = true,
  className,
}: HeatmapProps) {
  return (
    <div role="img" aria-label={label} className={cn('inline-flex flex-col gap-2.5', className)}>
      <div className="grid auto-cols-[14px] grid-flow-col grid-rows-[repeat(7,14px)] gap-1">
        {values.map((v, i) => {
          const level = v <= 0 ? 0 : Math.min(4, Math.ceil((v / max) * 4))
          return (
            <span
              key={i}
              title={titles?.[i]}
              data-level={level}
              className={cn(CELL, LEVEL[level])}
            />
          )
        })}
      </div>
      {legend ? (
        <div className="text-muted-foreground flex items-center justify-end gap-1 text-xs font-medium">
          <span className="mr-1">적음</span>
          {LEVEL.map((cls, l) => (
            <span key={l} className={cn(CELL, cls)} />
          ))}
          <span className="ml-1">많음</span>
        </div>
      ) : null}
    </div>
  )
}
