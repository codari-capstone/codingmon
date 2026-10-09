import { Skeleton } from '@/components/ui/skeleton'

interface ListSkeletonProps {
  rows?: number
}

/**
 * 목록을 기다리는 동안 보여 주는 모양 (UX-01).
 *
 * 라이브 영역의 안내는 영역 안 "텍스트"가 바뀔 때 나온다. 네모는 모두 aria-hidden이라
 * aria-label만 두면 접근 가능한 이름은 생기지만 읽을 내용이 없어 아무 안내도 나오지
 * 않는다. 그래서 sr-only 문구를 영역 안에 둔다.
 */
export function ListSkeleton({ rows = 5 }: ListSkeletonProps) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">불러오는 중</span>
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
