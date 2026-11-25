import { Skeleton } from '@/components/ui/skeleton'

/**
 * AI가 분석·리뷰를 만드는 동안 결과가 올 자리 (분석·리뷰 패널 공통). 요약 칸과 근거 칸 모양이다.
 * 진행 안내는 패널의 status 문구가 읽으므로 낭독기에는 숨긴다. ListSkeleton을 쓰면 '불러오는 중'이 겹쳐 읽힌다
 */
export function AiResultSkeleton() {
  return (
    <div data-testid="ai-result-skeleton" aria-hidden="true" className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-3 rounded-[16px] border p-5">
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-[26px] w-36 rounded-full" />
      </div>
      <div className="rounded-[14px] border px-4 py-3.5">
        <Skeleton lines={3} />
      </div>
    </div>
  )
}
