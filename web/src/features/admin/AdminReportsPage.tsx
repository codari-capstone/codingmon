import { keepPreviousData, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { ReportStatus } from '@/api/types'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Pagination } from '@/components/ui/pagination'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { cn } from '@/lib/utils'
import { ADMIN_PAGE_SIZE } from './adminProblemQuery'
import { adminReportListQuery, unresolvedReportCountQuery } from './adminReportQuery'
import { REPORT_STATUS_LABEL } from './labels'
import { ReportTable } from './ReportTable'

type Filter = 'ALL' | ReportStatus

/** 시안의 탭 순서. 전체 뒤에 상태 다섯 */
const FILTERS: Filter[] = [
  'ALL',
  'RECEIVED',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED',
  'PROBLEM_DELETED',
]

const filterStatuses = (filter: Filter): ReportStatus[] => (filter === 'ALL' ? [] : [filter])

/** 관리자 신고 목록 (ADM-13). 최신 신고가 위다 */
export function Component() {
  // 탭과 페이지를 한 상태로 둔다. 탭을 바꾸면 1페이지로 돌아가야 하는데, 따로 두면 옛 페이지로 한 번 더 받는다
  const [params, setParams] = useState<{ filter: Filter; page: number }>({
    filter: 'ALL',
    page: 1,
  })
  const { filter, page } = params

  const { data, isPending, isFetching, error, refetch } = useQuery({
    ...adminReportListQuery(filterStatuses(filter), page),
    // 탭·페이지를 바꾸는 동안 이전 표를 둔다. 스켈레톤으로 갈면 화면이 뛴다(문제 목록과 같은 선택)
    placeholderData: keepPreviousData,
  })
  const unresolved = useQuery(unresolvedReportCountQuery())
  // 탭 건수는 탭마다 size 1로 센다(계약). 목록과 따로 받아 한 탭을 보는 동안에도 다른 탭의 수가 보인다
  const counts = useQueries({
    queries: FILTERS.map((item) => ({
      ...adminReportListQuery(filterStatuses(item), 1, 1),
      select: (result: { totalElements: number }) => result.totalElements,
    })),
  })

  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  const pages = data ? Math.max(1, Math.ceil(data.totalElements / ADMIN_PAGE_SIZE)) : 1

  function handlePageChange(next: number) {
    if (next === page) return
    setParams((prev) => ({ ...prev, page: next }))
    // 페이지가 주소가 아니라 상태라 ScrollRestoration이 모른다. 표 아래에서 눌렀으니 위로 올린다
    window.scrollTo({ top: 0 })
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow text-primary-text">관리자</p>
        <h1 className="page-title">신고</h1>
        <p className="text-muted-foreground text-[15px]">
          처리 안 한 신고 <b className="text-foreground tabular-nums">{unresolved.data ?? '–'}</b>건
          · 학습자가 문제 풀이 화면에서 보낸 신고예요.
        </p>
      </div>

      <Tabs
        value={filter}
        onValueChange={(next) => setParams({ filter: next as Filter, page: 1 })}
        className="gap-6"
      >
        {/* 탭 여섯이 좁은 화면에서 넘치면 탭 줄 안에서 가로로 민다. 페이지는 밀리지 않는다 */}
        <div className="max-w-full overflow-x-auto p-1">
          <TabsList variant="pill" aria-label="신고 상태">
            {FILTERS.map((item, index) => {
              const label = item === 'ALL' ? '전체' : REPORT_STATUS_LABEL[item]
              const count = counts[index]?.data
              return (
                <TabsTrigger
                  key={item}
                  value={item}
                  // 글자와 건수가 '접수4'로 붙어 읽히지 않게 이름을 따로 준다(#315 리뷰)
                  aria-label={count === undefined ? label : `${label}, ${count}건`}
                >
                  {label}
                  <span className="text-muted-foreground tabular-nums">{count ?? ''}</span>
                </TabsTrigger>
              )
            })}
          </TabsList>
        </div>

        <TabsContent value={filter} className="flex flex-col gap-6">
          {isPending && !error ? <ListSkeleton rows={10} /> : null}

          {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

          {data && !error && !isPending ? (
            data.content.length === 0 ? (
              // 비어도 표와 같은 상자에 둔다. 상자 없이 펭귄만 뜨면 표 자리가 사라진 것처럼 보인다
              <div className="bg-card rounded-lg border">
                {page > 1 ? (
                  // 다른 관리자가 처리해 이 탭의 신고가 줄었다. 아래 페이지 이동으로 돌아간다
                  <EmptyState
                    title="이 페이지에는 신고가 없어요"
                    description="신고가 줄어 이 페이지는 비었어요. 앞 페이지로 돌아가세요."
                  />
                ) : (
                  <EmptyState
                    title={
                      filter === 'ALL' ? '아직 들어온 신고가 없어요' : '이 상태의 신고가 없어요'
                    }
                  />
                )}
              </div>
            ) : (
              <div
                aria-busy={isFetching}
                className={cn('bg-card rounded-lg border px-3 py-2', isFetching && 'opacity-60')}
              >
                <ReportTable reports={data.content} />
              </div>
            )
          ) : null}

          {/* 결과 범위 밖 페이지(빈 표)에서도 '이전'으로 돌아갈 길이라 표 밖에 둔다 */}
          {data && !error && !isPending && (pages > 1 || page > 1) ? (
            <Pagination page={page} total={pages} onChange={handlePageChange} />
          ) : null}
        </TabsContent>
      </Tabs>
    </section>
  )
}
