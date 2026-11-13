import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router'

import type { ProblemHistory } from '@/api/types'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Verdict } from '@/components/Verdict'
import { Table, type TableColumn } from '@/components/ui/data-table'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { pageCount, PAGE_SIZE } from '@/features/problems/problemListParams'
import { Pagination } from '@/components/ui/pagination'
import { cn } from '@/lib/utils'
import { problemSubmissionsPath } from './historyPath'
import { problemHistoryListQuery } from './historyQuery'
import { useHealPage, usePage } from './usePage'

type Row = ProblemHistory & { id: number }

const COLUMNS: TableColumn<Row>[] = [
  {
    key: 'title',
    header: '문제',
    render: (item) => (
      <Link
        to={problemSubmissionsPath(item.problemId)}
        className="text-foreground hover:text-primary-text font-semibold hover:underline"
      >
        {item.title}
      </Link>
    ),
  },
  {
    key: 'difficulty',
    header: '난이도',
    width: '110px',
    render: (item) => DIFFICULTY_LABEL[item.difficulty],
  },
  {
    key: 'solved',
    header: '맞힘 여부',
    width: '130px',
    // 판정이 아니라 문제 단위 상태지만, 판정과 같은 색·아이콘으로 읽히게 한다 (디자인)
    render: (item) =>
      item.solved ? (
        <Verdict verdict="ACCEPTED">맞음</Verdict>
      ) : (
        <Verdict verdict="WRONG_ANSWER">못 맞힘</Verdict>
      ),
  },
  {
    key: 'attemptCount',
    header: '시도 횟수',
    width: '110px',
    align: 'right',
    render: (item) => <span className="tabular-nums">{item.attemptCount}회</span>,
  },
  {
    key: 'maxRevealedHintLevel',
    header: '힌트 단계',
    width: '130px',
    align: 'right',
    render: (item) => (item.maxRevealedHintLevel === 0 ? '—' : `${item.maxRevealedHintLevel}단계`),
  },
]

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
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow text-primary-text">내 기록</p>
        <h1 className="page-title">제출 기록</h1>
        {/* 알림 영역은 늘 두고 내용만 바꾼다 (ProblemListPage와 같은 이유) */}
        <p className="text-muted-foreground min-h-[1.5em] text-[15px]" aria-live="polite">
          {data && !error && !waiting && data.content.length > 0
            ? `제출한 문제 ${data.totalElements}개`
            : null}
        </p>
      </div>

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
            <div
              aria-busy={isFetching}
              className={cn('bg-card rounded-lg border px-3 py-2', isFetching && 'opacity-60')}
            >
              {/* 좁은 화면은 줄바꿈 대신 가로 스크롤 (data-table) */}
              <Table
                columns={COLUMNS}
                rows={data.content.map((item) => ({ ...item, id: item.problemId }))}
                className="whitespace-nowrap"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* 맞힌 뒤의 제출은 세지 않아 제출 목록의 개수와 다를 수 있다 (계약). */}
              <p className="text-muted-foreground text-[13px]">
                시도 횟수와 힌트 단계는 처음 맞힐 때까지(못 맞혔으면 지금까지) 기준이에요.
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
            </div>
          </>
        )
      ) : null}
    </section>
  )
}
