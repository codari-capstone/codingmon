import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { pageCount, PAGE_SIZE } from '@/features/problems/problemListParams'
import { ProblemPagination } from '@/features/problems/ProblemPagination'
import { problemSubmissionsPath } from './historyPath'
import { problemHistoryListQuery } from './historyQuery'
import { useHealPage, usePage } from './usePage'

/** 제출 기록 — 제출한 문제를 마지막으로 제출한 순으로 (HIST-01). */
export function Component() {
  const [page, setPage] = usePage()
  const { data, isPending, isFetching, error, refetch } = useQuery(problemHistoryListQuery(page))
  const healing = useHealPage(page, data?.totalElements, setPage)

  const pages = data ? pageCount(data.totalElements) : 1

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">제출 기록</h1>

      {(isPending || healing) && !error ? <ListSkeleton rows={PAGE_SIZE} /> : null}

      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error && !healing ? (
        data.content.length === 0 ? (
          <EmptyState
            title="아직 제출한 문제가 없어요"
            description="문제를 풀고 제출하면 여기에 기록이 쌓여요."
            action={{ label: '문제 보러 가기', to: '/problems' }}
          />
        ) : (
          <>
            <p className="text-muted-foreground text-sm" aria-live="polite">
              제출한 문제 {data.totalElements}개
            </p>
            <div aria-busy={isFetching} className={isFetching ? 'opacity-60' : undefined}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>문제</TableHead>
                    <TableHead className="w-24">난이도</TableHead>
                    <TableHead className="w-24">맞힘 여부</TableHead>
                    <TableHead className="w-24">시도 횟수</TableHead>
                    <TableHead className="w-24">힌트 단계</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.content.map((item) => (
                    <TableRow key={item.problemId}>
                      <TableCell className="font-medium">
                        <Link
                          to={problemSubmissionsPath(item.problemId)}
                          className="hover:text-primary hover:underline"
                        >
                          {item.title}
                        </Link>
                      </TableCell>
                      <TableCell>{DIFFICULTY_LABEL[item.difficulty]}</TableCell>
                      <TableCell>{item.solved ? '맞음' : '못 맞힘'}</TableCell>
                      <TableCell className="tabular-nums">{item.attemptCount}</TableCell>
                      <TableCell className="tabular-nums">
                        {item.maxRevealedHintLevel === 0 ? '—' : `${item.maxRevealedHintLevel}단계`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* 맞힌 뒤의 제출은 세지 않아 제출 목록의 개수와 다를 수 있다 (계약). */}
            <p className="text-muted-foreground text-xs">
              시도 횟수와 힌트 단계는 처음 맞힐 때까지(못 맞혔으면 지금까지) 기준이에요.
            </p>
            {pages > 1 ? (
              <ProblemPagination
                page={page}
                pageCount={pages}
                onPageChange={(next) => {
                  if (next === page) return
                  setPage(next)
                  window.scrollTo({ top: 0 })
                }}
              />
            ) : null}
          </>
        )
      ) : null}
    </section>
  )
}
