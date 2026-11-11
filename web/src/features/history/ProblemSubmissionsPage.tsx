import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'

import type { SubmissionSummary } from '@/api/types'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { StatusText } from '@/components/StatusText'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { VERDICT_INFO } from '@/constants/verdicts'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { pageCount } from '@/features/problems/problemListParams'
import { ProblemPagination } from '@/features/problems/ProblemPagination'
import { LANGUAGE_LABEL } from '@/features/solve/labels'
import { parsePathId } from '@/lib/pathId'
import { cn } from '@/lib/utils'
import { problemHistoryQuery, problemSubmissionsQuery } from './historyQuery'
import { useHealPage, usePage } from './usePage'

/** 채점 불가는 판정이 아니라 상태다(계약). 결과 화면과 같은 표에서 이름과 판정 색을 가져온다. */
function Result({ item }: { item: SubmissionSummary }) {
  const key = item.status === 'JUDGE_ERROR' ? 'JUDGE_ERROR' : item.verdict
  if (key === null) return <span className="text-muted-foreground">—</span>
  const info = VERDICT_INFO[key]
  return <StatusText tone={info.tone}>{info.label}</StatusText>
}

/** 한 문제의 제출 목록 — 위에 문제 정보, 아래에 채점이 끝난 제출 (HIST-02). */
export function Component() {
  const problemId = parsePathId(useParams().problemId)
  const [page, setPage] = usePage()

  const info = useQuery({ ...problemHistoryQuery(problemId ?? 0), enabled: problemId !== null })
  const list = useQuery({
    ...problemSubmissionsQuery(problemId ?? 0, page),
    enabled: problemId !== null,
  })

  // 세션이 끊겼으면 로그인 화면으로 보낸다 (session.ts). 두 쿼리 어느 쪽의 401이든 같다.
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, info.error ?? list.error)
  }, [queryClient, info.error, list.error])

  // 되돌릴지는 지금 페이지의 응답으로만 가른다 (SubmissionHistoryPage와 같은 이유).
  const healing = useHealPage(
    page,
    list.isPlaceholderData ? undefined : list.data?.totalElements,
    setPage,
  )
  const waiting =
    list.isPending || healing || (list.isPlaceholderData && list.data?.content.length === 0)

  // 주소를 손으로 고친 경우다. 요청을 보내지 않고 없는 기록과 같은 문구로 끝낸다.
  const infoStatus = (info.error as { status?: number } | null)?.status
  if (problemId === null || infoStatus === 404) {
    // 계약: 이 API가 404면 제출 목록 응답과 관계없이 '기록 없음'을 보여 준다.
    return (
      <EmptyState
        headingLevel={1}
        title="이 문제의 제출 기록이 없어요"
        description="채점이 끝난 제출이 있어야 기록에 나와요."
        action={{ label: '제출 기록으로', to: '/submissions' }}
      />
    )
  }
  if (info.error) {
    return <ErrorState problem={info.error} headingLevel={1} onRetry={() => void info.refetch()} />
  }

  const pages = list.data ? pageCount(list.data.totalElements) : 1

  return (
    <section className="flex flex-col gap-4">
      <Link to="/submissions" className="text-primary-text text-sm underline">
        ← 제출 기록
      </Link>

      {info.data ? (
        <header className="flex flex-col gap-1">
          <h1 className="page-title">{info.data.title}</h1>
          <p className="text-muted-foreground text-sm">
            {DIFFICULTY_LABEL[info.data.difficulty]} · {info.data.solved ? '맞음' : '못 맞힘'} ·
            시도 {info.data.attemptCount}회
            {info.data.maxRevealedHintLevel > 0
              ? ` · 힌트 ${info.data.maxRevealedHintLevel}단계`
              : ''}
          </p>
          <Link
            to={`/problems/${info.data.problemId}`}
            className="text-primary-text text-sm underline"
          >
            문제 보기
          </Link>
        </header>
      ) : (
        <h1 className="page-title">제출 목록</h1>
      )}

      {waiting && !list.error ? <ListSkeleton rows={5} /> : null}

      {list.error ? <ErrorState problem={list.error} onRetry={() => void list.refetch()} /> : null}

      {list.data && !list.error && !waiting ? (
        list.data.content.length === 0 ? (
          <EmptyState
            title="채점이 끝난 제출이 없어요"
            description="채점 중인 제출은 결과 화면에서 볼 수 있고, 끝나면 여기에 나타나요."
          />
        ) : (
          <>
            <div
              aria-busy={list.isFetching}
              className={cn('bg-card rounded-lg border px-3 py-2', list.isFetching && 'opacity-60')}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">번호</TableHead>
                    <TableHead>결과</TableHead>
                    <TableHead>언어</TableHead>
                    <TableHead>시간</TableHead>
                    <TableHead>메모리</TableHead>
                    <TableHead>제출 시각</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data.content.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="tabular-nums">
                        <Link
                          to={`/submissions/${item.id}`}
                          className="text-primary-text underline"
                        >
                          #{item.id}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Result item={item} />
                      </TableCell>
                      <TableCell>{LANGUAGE_LABEL[item.language]}</TableCell>
                      {/* 컴파일 에러와 채점 불가는 null이다. 0ms로 적으면 "아주 빨랐다"로 읽힌다. */}
                      <TableCell className="tabular-nums">
                        {item.executionTimeMs === null ? '—' : `${item.executionTimeMs}ms`}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {item.memoryUsedKb === null
                          ? '—'
                          : `${item.memoryUsedKb.toLocaleString('ko-KR')}KB`}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(item.submittedAt).toLocaleString('ko-KR')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {pages > 1 ? (
              <ProblemPagination
                page={page}
                pageCount={pages}
                onPageChange={(next) => {
                  if (next === page) return
                  setPage(next)
                }}
              />
            ) : null}
          </>
        )
      ) : null}
    </section>
  )
}
