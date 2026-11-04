import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
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
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { pageCount, PAGE_SIZE } from '@/features/problems/problemListParams'
import { ProblemPagination } from '@/features/problems/ProblemPagination'
import { problemSubmissionsPath } from './historyPath'
import { problemHistoryListQuery } from './historyQuery'
import { useHealPage, usePage } from './usePage'

/** 제출 기록 — 제출한 문제를 마지막으로 제출한 순으로 (HIST-01). */
export function Component() {
  const [page, setPage] = usePage()
  const { data, isPending, isFetching, isPlaceholderData, error, refetch } = useQuery(
    problemHistoryListQuery(page),
  )

  // 세션이 끊겼으면 로그인 화면으로 보낸다 (session.ts). 문구만 띄우면 헤더가 계속 로그인
  // 상태로 보이고 사용자가 주소를 직접 쳐야 한다.
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  // 되돌릴지는 지금 페이지의 응답으로만 가른다. 묵은 응답은 다른 조건의 값일 수 있다
  // (ProblemListPage와 같은 이유).
  const healing = useHealPage(page, isPlaceholderData ? undefined : data?.totalElements, setPage)
  // 되돌린 직후 묵은 응답이 빈 표이면 빈 상태 안내가 잠깐 보인다. 로딩으로 본다.
  const waiting = isPending || healing || (isPlaceholderData && data?.content.length === 0)

  const pages = data ? pageCount(data.totalElements) : 1

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">제출 기록</h1>

      {waiting && !error ? <ListSkeleton rows={PAGE_SIZE} /> : null}

      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error && !waiting ? (
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
