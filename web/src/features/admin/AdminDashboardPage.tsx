import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { cn } from '@/lib/utils'
import { unpublishedProblemCountQuery } from './adminProblemQuery'
import { adminReportListQuery, unresolvedReportCountQuery } from './adminReportQuery'
import { paymentNeedsCancelCountQuery, suspendedUserCountQuery } from './adminUserQuery'
import { ReportTable } from './ReportTable'

/** 대시보드에 보이는 최근 신고 수 (시안 AdminDashboard) */
const RECENT_REPORTS = 5
/** 카드 네 개가 함께 쓰는 틀(#390). 테두리는 따로 준다 — 결제 카드는 1명 이상이면 빨간 2px다 */
const CARD =
  'bg-card flex h-full min-h-36 flex-wrap items-center justify-between gap-4 rounded-lg p-6 sm:p-8'
/** 카드 오른쪽의 이동 표시. 카드 전체가 링크라 글자만 둔다 */
const GO = 'text-primary-text text-sm font-semibold whitespace-nowrap'

/** 카드 왼쪽의 이름·수·설명. 수를 확인하지 못했으면 '–'다 */
function CardText({
  label,
  count,
  unit,
  note,
  alert = false,
}: {
  label: string
  count: number | undefined
  unit: string
  note: React.ReactNode
  alert?: boolean
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span
        className={cn(
          'text-sm font-semibold',
          alert ? 'text-destructive-text' : 'text-muted-foreground',
        )}
      >
        {label}
      </span>
      <span className="text-foreground">
        <b className="text-3xl tabular-nums">{count ?? '–'}</b>
        <span className="ml-1 text-lg">{unit}</span>
      </span>
      <span className="text-muted-foreground text-sm tabular-nums">{note}</span>
    </span>
  )
}

/** 상태 하나의 신고 수. 신고 목록의 탭 건수와 같은 키라 두 화면이 한 번만 받는다 */
const statusCount = (status: 'RECEIVED' | 'IN_PROGRESS') => ({
  ...adminReportListQuery([status], 1, 1),
  select: (data: { totalElements: number }) => data.totalElements,
})

/**
 * 관리자 대시보드 (ADM-12). 할 일이 생기는 수 네 가지(처리 안 한 신고, 취소·확인이 필요한 결제,
 * 공개 안 된 문제, 정지 중인 회원)를 같은 크기의 카드로, 그 아래에 최근 신고를 보인다.
 * 전체 문제·회원·제출 수 같은 현황 숫자는 넣지 않는다(#222에서 정함).
 */
export function Component() {
  const unresolved = useQuery(unresolvedReportCountQuery())
  const received = useQuery(statusCount('RECEIVED'))
  const inProgress = useQuery(statusCount('IN_PROGRESS'))
  const recent = useQuery(adminReportListQuery([], 1, RECENT_REPORTS))
  const needsCancel = useQuery(paymentNeedsCancelCountQuery())
  const unpublished = useQuery(unpublishedProblemCountQuery())
  const suspended = useQuery(suspendedUserCountQuery())

  // 하나라도 실패하면 한 번 알리고, 다시 시도는 실패한 것을 모두 다시 받는다.
  // 수만 실패하면 표는 멀쩡한데 카드가 '–'에 멈춰 다시 받을 길이 없다
  const queries = [unresolved, received, inProgress, recent, needsCancel, unpublished, suspended]
  const failure = queries.find((query) => query.error)?.error ?? null

  // 세션이 끊겼으면 캐시에서 지워 로그인 화면으로 보낸다(신고 목록과 같은 처리).
  // 보여 주는 오류는 첫 번째지만 401은 모두 본다. 다른 조회가 500이어도 놓치지 않게(회원 상세와 같다)
  const queryClient = useQueryClient()
  useEffect(() => {
    for (const each of [
      unresolved.error,
      received.error,
      inProgress.error,
      recent.error,
      needsCancel.error,
      unpublished.error,
      suspended.error,
    ]) {
      forgetSessionIfUnauthorized(queryClient, each)
    }
  }, [
    queryClient,
    unresolved.error,
    received.error,
    inProgress.error,
    recent.error,
    needsCancel.error,
    unpublished.error,
    suspended.error,
  ])

  // 확인한 수만 보인다. 실패했으면 캐시에 남은 지난 수여도 모르는 것으로 본다
  const cancelCount = needsCancel.error ? undefined : needsCancel.data
  const cancelAlert = cancelCount !== undefined && cancelCount > 0
  const paymentCardBody = (
    <>
      <CardText
        label="취소·확인이 필요한 결제"
        count={cancelCount}
        unit="명"
        alert={cancelAlert}
        note={
          // 1시간 넘게 결과를 모르는 결제도 센다(계약). 곧 확정될 결제를 취소하지 않게 확인부터 안내한다
          cancelAlert
            ? '돈은 나갔는데 구독에 반영하지 않았거나, 1시간 넘게 결과를 모르는 결제예요. 포트원 콘솔에서 상태를 확인하고 처리해 주세요.'
            : needsCancel.error
              ? '결제 수를 확인하지 못했어요.'
              : '지금은 처리할 결제가 없어요.'
        }
      />
      {cancelAlert ? (
        <ChevronRight aria-hidden className="text-foreground size-5 flex-none" />
      ) : null}
    </>
  )

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

      {/* 결제 수를 받기 전에는 자리만 잡고 감춘다. 받은 뒤 카드가 끼어들며 신고 버튼이 옮겨지지 않게 */}
      <div
        data-testid="dashboard-cards"
        className={cn('grid gap-6 lg:grid-cols-2', needsCancel.isPending && 'invisible')}
      >
        <section aria-label="처리할 신고" className={cn(CARD, 'border')}>
          <CardText
            label="처리 안 한 신고"
            count={unresolved.data}
            unit="건"
            note={`접수 ${received.data ?? '–'}건 · 확인 중 ${inProgress.data ?? '–'}건`}
          />
          <Button asChild variant="accent">
            <Link to="/admin/reports">신고 처리하러 가기</Link>
          </Button>
        </section>

        {/*
          늘 그려 자리를 잡는다. 받은 뒤에 끼어들면 좁은 화면에서 아래 최근 신고가 밀린다(#380 리뷰).
          1명 이상이면 빨간 테두리로 대상 회원 목록에 보낸다. 0명이면 갈 곳이 없어 링크를 두지 않는다.
          다시 받기에 실패하면 캐시의 지난 수를 확정처럼 보이지 않게 '–'로 둔다(#380 리뷰)
        */}
        <section
          aria-label="취소·확인이 필요한 결제"
          className={cancelAlert ? undefined : cn(CARD, 'border')}
        >
          {cancelAlert ? (
            <Link
              to="/admin/members?paymentNeedsCancel=true"
              className={cn(CARD, 'border-destructive hover:bg-muted/40 flex-nowrap border-2')}
            >
              {paymentCardBody}
            </Link>
          ) : (
            paymentCardBody
          )}
        </section>

        {/* 공개 중인 버전이 없는 문제만 센다(계약). 문제 목록에는 공개 여부 필터가 없어 목록 그대로 보낸다 */}
        <section aria-label="공개 안 된 문제">
          <Link to="/admin/problems" className={cn(CARD, 'hover:bg-muted/40 border')}>
            <CardText
              label="공개 안 된 문제"
              count={unpublished.error ? undefined : unpublished.data}
              unit="개"
              note="학습자에게 아직 보이지 않는 문제예요."
            />
            <span className={GO}>문제 목록 →</span>
          </Link>
        </section>

        <section aria-label="정지 중인 회원">
          <Link
            to="/admin/members?status=SUSPENDED"
            className={cn(CARD, 'hover:bg-muted/40 border')}
          >
            <CardText
              label="정지 중인 회원"
              count={suspended.error ? undefined : suspended.data}
              unit="명"
              note="정지 24시간이 지나면 강제 탈퇴할 수 있어요."
            />
            <span className={GO}>정지 회원 →</span>
          </Link>
        </section>
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
