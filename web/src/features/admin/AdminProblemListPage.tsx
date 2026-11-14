import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
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
import { Pagination } from '@/components/ui/pagination'
import { ADMIN_PAGE_SIZE, adminProblemListQuery } from './adminProblemQuery'
import { cn } from '@/lib/utils'
import { problemStateLabel, problemStateTone } from './labels'

/** 검색어를 조회에 반영하기까지 기다리는 시간. 사용자 목록과 같은 값이다. */
const SEARCH_DEBOUNCE_MS = 300

/** 관리자 문제 관리 목록 (ADM-01, COM-05). */
export function Component() {
  const [draft, setDraft] = useState('')
  /**
   * 조회 조건. 검색어와 페이지를 **한 상태로** 둔다.
   *
   * 따로 두면 입력할 때 페이지만 먼저 1로 돌아가, 디바운스가 끝나기 전 옛 검색어로
   * 1페이지를 한 번 더 조회한다 — 표가 전체 목록으로 바뀐 뒤 300ms 만에 검색 결과로
   * 또 바뀐다. 한 번에 바꾸면 그 중간 조회가 없다.
   */
  const [params, setParams] = useState({ keyword: '', page: 1 })
  const { keyword, page } = params

  const { data, isPending, isFetching, error, refetch } = useQuery({
    ...adminProblemListQuery(params),
    // 검색어를 고치는 동안 이전 표를 유지한다. 스켈레톤으로 갈아끼우면 표가
    // 사라졌다 나타나며 화면이 뛴다 (사용자 목록과 같은 선택).
    placeholderData: keepPreviousData,
  })

  // 세션이 끊겼으면 캐시에서 지워 로그인 화면으로 보낸다. 문구만 띄우면 헤더와
  // RequireAuth는 계속 로그인 상태로 보아 길이 막힌다 (SubmissionResultPage와 같은 처리).
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  // 검색어는 공백을 떼고 보낸다. 공백만 치면 서버는 isBlank로 보아 전체를 돌려주는데,
  // 화면은 keyword가 있다고 보아 '조건에 맞는 문제 25개'라고 말한다.
  useEffect(() => {
    const trimmed = draft.trim()
    if (trimmed === keyword) return

    const timer = setTimeout(() => setParams({ keyword: trimmed, page: 1 }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, keyword])

  const pages = data ? Math.max(1, Math.ceil(data.totalElements / ADMIN_PAGE_SIZE)) : 1

  function handlePageChange(next: number) {
    if (next === page) return
    setParams((prev) => ({ ...prev, page: next }))
    // 표 아래 버튼을 눌렀으므로 그대로 두면 새 페이지의 첫 줄이 화면 위로 지나가 있다.
    // 페이지가 주소가 아니라 상태라 ScrollRestoration이 모르므로 직접 올린다.
    window.scrollTo({ top: 0 })
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-eyebrow text-primary-text">관리자</p>
          <h1 className="page-title">문제 관리</h1>
        </div>
        <Button asChild className="min-h-11">
          <Link to="/admin/problems/new">새 문제</Link>
        </Button>
      </div>

      {/*
        시안에는 상태 필터(전체·공개·작성 중·검증 중·비공개)가 있지만 두지 않는다. 목록 API가
        상태로 거르지 못해(keyword·page·size뿐), 화면에서 거르면 한 페이지 안에서만 걸러 개수와
        페이지가 틀린다. API가 생기면 이 줄에 Tabs pill을 둔다.
      */}
      <SearchInput
        aria-label="제목으로 검색"
        placeholder="제목으로 검색"
        className="w-[300px] max-w-full self-end"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />

      {isPending && !error ? <ListSkeleton rows={ADMIN_PAGE_SIZE} /> : null}

      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error && !isPending ? (
        data.content.length === 0 ? (
          // 결과보다 뒤인 페이지다. 디바운스를 기다리는 동안 '다음'을 눌렀거나, 다른
          // 관리자가 문제를 지운 뒤 다시 조회된 경우다. 아래 페이지 이동을 그대로 띄워
          // 두므로 여기 갇히지 않는다 — page는 주소에 없어 새로고침으로는 못 나간다.
          page > 1 ? (
            <EmptyState
              title="이 페이지에는 문제가 없습니다"
              description="결과가 줄어 이 페이지는 비었어요. 앞 페이지로 돌아가세요."
            />
          ) : keyword ? (
            <EmptyState title="조건에 맞는 문제가 없습니다" description="검색어를 바꿔 보세요." />
          ) : (
            <EmptyState
              title="아직 만든 문제가 없습니다"
              description="새 문제를 등록하면 여기에 보입니다."
            />
          )
        ) : (
          <>
            <p className="text-muted-foreground text-sm" aria-live="polite">
              {keyword ? '조건에 맞는 문제' : '문제'} {data.totalElements}개
            </p>
            <div
              aria-busy={isFetching}
              className={cn('bg-card rounded-lg border px-3 py-2', isFetching && 'opacity-60')}
            >
              {/* 좁은 화면에서는 열을 짜내지 않고 표 안에서 가로로 민다(Table이 overflow-x-auto). 시안도 같다 */}
              <Table className="min-w-[640px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">번호</TableHead>
                    <TableHead>제목</TableHead>
                    <TableHead className="w-28">난이도</TableHead>
                    <TableHead className="w-44">상태</TableHead>
                    <TableHead className="w-28">최신 버전</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.content.map((problem) => (
                    <TableRow key={problem.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {problem.id}
                      </TableCell>
                      <TableCell className="font-medium">
                        {/* 셀 전체를 누를 수 있게 둔다 (ProblemTable과 같은 선택) */}
                        <Link
                          to={`/admin/problems/${problem.id}`}
                          className="hover:text-primary-text hover:underline"
                        >
                          {problem.title}
                        </Link>
                      </TableCell>
                      <TableCell>{DIFFICULTY_LABEL[problem.difficulty]}</TableCell>
                      <TableCell>
                        <Badge
                          tone={problemStateTone(problem.latestStatus, problem.publishedVersionNo)}
                        >
                          {problemStateLabel(problem.latestStatus, problem.publishedVersionNo)}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        v{problem.latestVersionNo}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )
      ) : null}

      {/*
        한 페이지로 끝나면 이동할 곳이 없다 — 꺼진 버튼만 둘 띄우지 않는다. 표 밖에
        두는 까닭은 빈 표에서도 띄워야 하기 때문이다. 결과 범위 밖 페이지(page > 1인데
        결과가 0개)에서 '이전'으로 돌아갈 유일한 길이다.
      */}
      {data && !error && !isPending && (pages > 1 || page > 1) ? (
        <Pagination page={page} total={pages} onChange={handlePageChange} />
      ) : null}
    </section>
  )
}
