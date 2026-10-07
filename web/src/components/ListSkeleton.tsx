import { Skeleton } from '@/components/ui/skeleton'

interface ListSkeletonProps {
  rows?: number
}

/**
 * 목록을 기다리는 동안 보여 주는 모양 (UX-01).
 *
 * role="status"로 감싸 스크린 리더가 "불러오는 중"으로 읽게 한다. 안쪽 네모는
 * aria-hidden이라 빈 요소가 읽히지 않는다.
 */
export function ListSkeleton({ rows = 5 }: ListSkeletonProps) {
  return (
    <div role="status" aria-label="불러오는 중" aria-live="polite">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          data-testid="skeleton-row"
          aria-hidden="true"
          className="border-border/60 flex items-center gap-4 border-b py-3"
        >
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="ml-auto h-3 w-20" />
        </div>
      ))}
    </div>
  )
}
