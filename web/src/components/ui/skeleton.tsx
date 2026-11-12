import { cn } from 'cn'

type SkeletonProps = React.ComponentProps<'div'> & {
  /** 원형 자리표시자 (아바타) */
  circle?: boolean
  /** 주면 문단 모양: 이 줄 수만큼 쌓고 마지막 줄은 60% 너비 */
  lines?: number
}

/**
 * 내용이 올 자리를 미리 채워 두는 회색 자리표시자. 실제 내용과 같은 자리·크기로 놓고 감싼 영역에 aria-busy를 둔다.
 * 1초 넘게 걸리는 화면 전체 로딩에는 LoadingState(펭귄)를 쓴다.
 *
 * 색은 디자인의 surface-subtle이 아니라 border다. 옅은 면(#f4f6fb)은 흰 바탕·카드 위 1.08:1이라 자리표시자가
 * 사라진다. border는 옛 muted 수준(1.24:1)이다 (#250 리뷰).
 */
function Skeleton({ className, circle, lines, ...props }: SkeletonProps) {
  const block = 'animate-pulse bg-border motion-reduce:animate-none'
  if (lines) {
    return (
      <div aria-hidden="true" className={cn('flex flex-col gap-2.5', className)} {...props}>
        {Array.from({ length: lines }, (_, i) => (
          <span
            key={i}
            data-slot="skeleton"
            className={cn(
              block,
              'block h-3.5 rounded-sm',
              i === lines - 1 && lines > 1 ? 'w-3/5' : 'w-full',
            )}
          />
        ))}
      </div>
    )
  }
  return (
    <div
      data-slot="skeleton"
      className={cn(block, circle ? 'rounded-full' : 'rounded-md', className)}
      {...props}
    />
  )
}

export { Skeleton }
