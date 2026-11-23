import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ClipboardList, CreditCard } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { adminReportListQuery, unresolvedReportCountQuery } from './adminReportQuery'
import { paymentNeedsCancelCountQuery } from './adminUserQuery'
import { ReportTable } from './ReportTable'

/** 대시보드에 보이는 최근 신고 수 (시안 AdminDashboard) */
const RECENT_REPORTS = 5

/** 상태 하나의 신고 수. 신고 목록의 탭 건수와 같은 키라 두 화면이 한 번만 받는다 */
const statusCount = (status: 'RECEIVED' | 'IN_PROGRESS') => ({
  ...adminReportListQuery([status], 1, 1),
  select: (data: { totalElements: number }) => data.totalElements,
})

/**
 * 관리자 대시보드 (ADM-12). 처리 안 한 신고 수와 최근 신고, 취소가 필요한 결제가 있는 회원 수를 보인다.
 * 문제·회원·제출 수는 넣지 않는다(#222에서 정함).
 */
export function Component() {
  const unresolved = useQuery(unresolvedReportCountQuery())
  const received = useQuery(statusCount('RECEIVED'))
  const inProgress = useQuery(statusCount('IN_PROGRESS'))
  const recent = useQuery(adminReportListQuery([], 1, RECENT_REPORTS))
  const needsCancel = useQuery(paymentNeedsCancelCountQuery())

  // 하나라도 실패하면 한 번 알리고, 다시 시도는 실패한 것을 모두 다시 받는다.
  // 수만 실패하면 표는 멀쩡한데 카드가 '–'에 멈춰 다시 받을 길이 없다
  const queries = [unresolved, received, inProgress, recent, needsCancel]
  const failure = queries.find((query) => query.error)?.error ?? null

  // 세션이 끊겼으면 캐시에서 지워 로그인 화면으로 보낸다(신고 목록과 같은 처리)
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, failure)
  }, [queryClient, failure])

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow text-primary-text">관리자</p>
        <h1 className="page-title">대시보드</h1>
      </div>

      {failure ? (
        <ErrorState
          problem={failure}
          onRetry={() => queries.forEach((query) => query.error && void query.refetch())}
        />
      ) : null}

      <div
        className={
          needsCancel.data ? 'grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]' : undefined
        }
      >
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

        {/* 1건 이상일 때만 보인다. 0건이면 신고 카드가 전체 폭을 쓴다 */}
        {needsCancel.data ? (
          <section aria-label="취소가 필요한 결제">
            <Link
              to="/admin/members?paymentNeedsCancel=true"
              className="bg-card border-destructive hover:bg-muted/40 flex h-full flex-col gap-1 rounded-lg border-2 p-6 sm:p-8"
            >
              <span className="text-destructive-text flex items-center justify-between gap-2 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  <CreditCard aria-hidden className="size-4" />
                  취소가 필요한 결제
                </span>
                <ChevronRight aria-hidden className="text-foreground size-5" />
              </span>
              <span className="text-foreground mt-2 text-sm">결제가 있는 회원</span>
              <span className="text-foreground">
                <b className="text-3xl tabular-nums">{needsCancel.data}</b>
                <span className="ml-1 text-lg">명</span>
              </span>
              <span className="text-muted-foreground mt-2 text-sm">
                돈은 나갔는데 구독에 반영하지 않은 결제예요. 포트원 콘솔에서 취소해 주세요.
              </span>
            </Link>
          </section>
        ) : null}
      </div>

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

        {recent.data && !recent.error ? (
          recent.data.content.length === 0 ? (
            <div className="bg-card rounded-lg border">
              <EmptyState title="아직 들어온 신고가 없어요" />
            </div>
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
