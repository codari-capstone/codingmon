import { cn } from 'cn'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      // bg-muted(#f4f6fb)는 흰 바탕·카드 위 1.08:1이라 자리표시자가 사라진다. border는 옛 muted 수준(1.24:1)이다 (#250 리뷰)
      className={cn('animate-pulse rounded-md bg-border', className)}
      {...props}
    />
  )
}

export { Skeleton }
