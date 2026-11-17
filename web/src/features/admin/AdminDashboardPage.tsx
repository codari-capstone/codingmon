import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { adminReportListQuery, unresolvedReportCountQuery } from './adminReportQuery'
import { ReportTable } from './ReportTable'

/** 대시보드에 보이는 최근 신고 수 (시안 AdminDashboard) */
const RECENT_REPORTS = 5

/** 상태 하나의 신고 수. 신고 목록의 탭 건수와 같은 키라 두 화면이 한 번만 받는다 */
const statusCount = (status: 'RECEIVED' | 'IN_PROGRESS') => ({
  ...adminReportListQuery([status], 1, 1),
  select: (data: { totalElements: number }) => data.totalElements,
})

/**
 * 관리자 대시보드 (ADM-12). 처리 안 한 신고 수와 최근 신고만 보인다.
 * 문제·회원·제출 수는 넣지 않는다(#222에서 정함).
 */
export function Component() {
  const unresolved = useQuery(unresolvedReportCountQuery())
  const received = useQuery(statusCount('RECEIVED'))
  const inProgress = useQuery(statusCount('IN_PROGRESS'))
  const recent = useQuery(adminReportListQuery([], 1, RECENT_REPORTS))

  // 세션이 끊겼으면 캐시에서 지워 로그인 화면으로 보낸다(신고 목록과 같은 처리)
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, recent.error ?? unresolved.error)
  }, [queryClient, recent.error, unresolved.error])

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow text-primary-text">관리자</p>
        <h1 className="page-title">대시보드</h1>
      </div>

      <section
        aria-label="처리할 신고"
        className="bg-card flex flex-wrap items-center justify-between gap-6 rounded-lg border p-6 sm:p-8"
      >
        <div className="flex items-center gap-5">
          <span className="bg-accent text-primary-text grid size-14 shrink-0 place-items-center rounded-lg">
            <ClipboardList aria-hidden className="size-7" />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-sm font-semibold">처리 안 한 신고</span>
            <span className="text-foreground">
              <b className="text-3xl tabular-nums">{unresolved.data ?? '–'}</b>
              <span className="ml-1 text-lg">건</span>
            </span>
            <span className="text-muted-foreground text-sm tabular-nums">
              접수 {received.data ?? '–'}건 · 확인 중 {inProgress.data ?? '–'}건
            </span>
          </div>
        </div>
        <Button asChild variant="accent" size="lg">
          <Link to="/admin/reports">신고 처리하러 가기</Link>
        </Button>
      </section>

      <section aria-labelledby="recent-reports" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <h2 id="recent-reports" className="text-lg font-bold">
            최근 신고
          </h2>
          <Link
            to="/admin/reports"
            className="text-primary-text text-sm font-semibold hover:underline"
          >
            전체 보기 →
          </Link>
        </div>

        {recent.isPending && !recent.error ? <ListSkeleton rows={RECENT_REPORTS} /> : null}

        {recent.error ? (
          <ErrorState problem={recent.error} onRetry={() => void recent.refetch()} />
        ) : null}

        {recent.data && !recent.error ? (
          recent.data.content.length === 0 ? (
            <EmptyState title="아직 들어온 신고가 없어요" />
          ) : (
            <div className="bg-card rounded-lg border px-3 py-2">
              <ReportTable reports={recent.data.content} />
            </div>
          )
        ) : null}
      </section>
    </section>
  )
}
