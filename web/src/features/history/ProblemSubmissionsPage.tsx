import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'

import type { SubmissionSummary } from '@/api/types'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Verdict } from '@/components/Verdict'
import { Badge } from '@/components/ui/badge'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Table, type TableColumn } from '@/components/ui/data-table'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { pageCount } from '@/features/problems/problemListParams'
import { Pagination } from '@/components/ui/pagination'
import { LANGUAGE_LABEL } from '@/features/solve/labels'
import { parsePathId } from '@/lib/pathId'
import { cn } from '@/lib/utils'
import { problemHistoryQuery, problemSubmissionsQuery } from './historyQuery'
import { useHealPage, usePage } from './usePage'

/** 채점 불가는 판정이 아니라 상태다(계약). 결과 화면과 같은 부품으로 이름과 판정 색을 그린다. */
function Result({ item }: { item: SubmissionSummary }) {
  const key = item.status === 'JUDGE_ERROR' ? 'JUDGE_ERROR' : item.verdict
  if (key === null) return <span className="text-muted-foreground">—</span>
  return <Verdict verdict={key} />
}

// 디자인은 연도 없이 짧게 적는다. 전체 시각은 title로 남긴다
const SUBMITTED_AT = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

const COLUMNS: TableColumn<SubmissionSummary>[] = [
  {
    key: 'id',
    header: '번호',
    width: '90px',
    render: (item) => (
      <Link
        to={`/submissions/${item.id}`}
        className="text-primary-text font-semibold tabular-nums hover:underline"
      >
        #{item.id}
      </Link>
    ),
  },
  { key: 'result', header: '결과', render: (item) => <Result item={item} /> },
  { key: 'language', header: '언어', render: (item) => LANGUAGE_LABEL[item.language] },
  {
    key: 'executionTimeMs',
    header: '시간',
    align: 'right',
    // 컴파일 에러와 채점 불가는 null이다. 0ms로 적으면 "아주 빨랐다"로 읽힌다.
    render: (item) => (
      <span className="tabular-nums">
        {item.executionTimeMs === null ? '—' : `${item.executionTimeMs}ms`}
      </span>
    ),
  },
  {
    key: 'memoryUsedKb',
    header: '메모리',
    align: 'right',
    render: (item) => (
      <span className="tabular-nums">
        {item.memoryUsedKb === null ? '—' : `${item.memoryUsedKb.toLocaleString('ko-KR')}KB`}
      </span>
    ),
  },
  {
    key: 'submittedAt',
    header: '제출 시각',
    align: 'right',
    render: (item) => {
      const at = new Date(item.submittedAt)
      return (
        <time
          dateTime={item.submittedAt}
          title={at.toLocaleString('ko-KR')}
          className="text-muted-foreground whitespace-nowrap"
        >
          {SUBMITTED_AT.format(at)}
        </time>
      )
    },
  },
]

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
    <section className="flex flex-col gap-6">
      <Breadcrumb
        items={[
          { label: '제출 기록', href: '/submissions' },
          { label: info.data?.title ?? '제출 목록' },
        ]}
      />

      {info.data ? (
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-3">
            <h1 className="page-title">{info.data.title}</h1>
            <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
              <Badge tone="outline">{DIFFICULTY_LABEL[info.data.difficulty]}</Badge>
              {info.data.solved ? (
                <Verdict verdict="ACCEPTED">맞음</Verdict>
              ) : (
                <Verdict verdict="WRONG_ANSWER">못 맞힘</Verdict>
              )}
              <span>
                · 시도 {info.data.attemptCount}회
                {info.data.maxRevealedHintLevel > 0
                  ? ` · 힌트 ${info.data.maxRevealedHintLevel}단계`
                  : ''}
              </span>
            </p>
          </div>
          <Button asChild>
            <Link to={`/problems/${info.data.problemId}`}>문제 보기</Link>
          </Button>
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
              {/* 좁은 화면은 줄바꿈 대신 가로 스크롤 (data-table) */}
              <Table columns={COLUMNS} rows={list.data.content} className="whitespace-nowrap" />
            </div>
            {/* 계약: 시도 횟수(attemptCount)는 채점 불가를 세지 않는다 */}
            <p className="text-muted-foreground text-[13px]">
              채점 불가는 서버 문제라 시도 횟수에 넣지 않아요.
            </p>
            {pages > 1 ? (
              <Pagination
                page={page}
                total={pages}
                onChange={(next) => {
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
