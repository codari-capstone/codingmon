import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useState } from 'react'

import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Verdict } from '@/components/Verdict'
import { Button } from '@/components/ui/button'
import { CodeBlock } from '@/components/ui/code-block'
import { Icon } from '@/components/ui/icon'
import { Pagination } from '@/components/ui/pagination'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { formatSubmittedAt } from '@/features/history/formatSubmittedAt'
import { LANGUAGE_LABEL, SOURCE_FILE_NAME } from '@/features/solve/labels'
import { cn } from '@/lib/utils'
import { ADMIN_PAGE_SIZE } from './adminProblemQuery'
import { adminSubmissionQuery, adminUserSubmissionsQuery } from './adminUserQuery'

/** 회원의 제출 목록 (ADM-15). 최신순, 한 줄씩 펼쳐 코드와 결과를 본다 */
export function MemberSubmissions({ userId }: { userId: number }) {
  const [page, setPage] = useState(1)
  // 시안처럼 한 번에 하나만 펼친다
  const [openId, setOpenId] = useState<number | null>(null)
  const { data, isPending, isFetching, error, refetch } = useQuery({
    ...adminUserSubmissionsQuery(userId, page),
    placeholderData: keepPreviousData,
  })
  const pages = data ? Math.max(1, Math.ceil(data.totalElements / ADMIN_PAGE_SIZE)) : 1

  // 세션이 끊겼으면 캐시에서 지워 로그인 화면으로 보낸다. 페이지를 넘기다 401이 와도 오류만 남지 않게
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  return (
    <section
      aria-labelledby="member-submissions"
      className="bg-card flex min-w-0 flex-col gap-4 rounded-lg border p-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="member-submissions" className="text-lg font-bold">
          제출 목록
        </h2>
        {data ? (
          <span className="text-muted-foreground text-sm tabular-nums">
            총 {data.totalElements}개
          </span>
        ) : null}
      </div>

      {isPending && !error ? <ListSkeleton rows={6} /> : null}
      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error ? (
        data.content.length === 0 ? (
          <p className="text-muted-foreground text-sm">아직 제출이 없어요.</p>
        ) : (
          <div aria-busy={isFetching} className={cn(isFetching && 'opacity-60')}>
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">번호</TableHead>
                  <TableHead>문제</TableHead>
                  <TableHead className="w-36">결과</TableHead>
                  <TableHead className="w-20">언어</TableHead>
                  <TableHead className="w-44">제출 시각</TableHead>
                  {/* relative: sr-only(absolute)가 표의 가로 스크롤 상자를 벗어나 좁은 화면의 문서 폭을 민다 */}
                  <TableHead className="relative w-12">
                    <span className="sr-only">펼치기</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.content.map((item) => {
                  const open = openId === item.id
                  return (
                    <Fragment key={item.id}>
                      <TableRow>
                        <TableCell className="text-muted-foreground tabular-nums">
                          #{item.id}
                        </TableCell>
                        <TableCell className="font-medium break-keep [overflow-wrap:anywhere]">
                          {item.problemTitle}
                        </TableCell>
                        <TableCell>
                          <Verdict verdict={item.verdict ?? 'JUDGE_ERROR'} />
                        </TableCell>
                        <TableCell>{LANGUAGE_LABEL[item.language]}</TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {formatSubmittedAt(item.submittedAt)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            shape="circle"
                            size="sm"
                            aria-expanded={open}
                            aria-label={`${open ? '접기' : '코드와 결과 보기'}: 제출 #${item.id}`}
                            onClick={() => setOpenId(open ? null : item.id)}
                          >
                            <Icon
                              name="chevron-down"
                              size={18}
                              className={cn('transition-transform', open && 'rotate-180')}
                            />
                          </Button>
                        </TableCell>
                      </TableRow>
                      {open ? (
                        <TableRow>
                          <TableCell colSpan={6} className="whitespace-normal">
                            <SubmissionDetail id={item.id} />
                          </TableCell>
                        </TableRow>
                      ) : null}
                    </Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )
      ) : null}

      {data && !error && (pages > 1 || page > 1) ? (
        <Pagination
          page={page}
          total={pages}
          onChange={(next) => {
            setPage(next)
            setOpenId(null)
          }}
          className="self-center"
        />
      ) : null}
    </section>
  )
}

/** 펼친 제출의 코드와 결과·시간·메모리. 케이스별 결과는 계약이 주지 않는다 */
function SubmissionDetail({ id }: { id: number }) {
  const { data, error, refetch } = useQuery(adminSubmissionQuery(id))
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  if (error) return <ErrorState problem={error} onRetry={() => void refetch()} />
  if (!data) return <ListSkeleton rows={3} />

  return (
    <div className="flex flex-col gap-3 py-2">
      <dl className="m-0 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-muted-foreground">결과</dt>
          <dd className="m-0">
            <Verdict verdict={data.verdict ?? 'JUDGE_ERROR'} />
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">시간</dt>
          <dd className="m-0 tabular-nums">
            {data.executionTimeMs === null ? '—' : `${data.executionTimeMs}ms`}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted-foreground">메모리</dt>
          <dd className="m-0 tabular-nums">
            {data.memoryUsedKb === null ? '—' : `${data.memoryUsedKb.toLocaleString('ko-KR')}KB`}
          </dd>
        </div>
      </dl>
      {data.sourceCode === null ? (
        <p className="text-muted-foreground text-sm">코드가 남아 있지 않아요.</p>
      ) : (
        <CodeBlock code={data.sourceCode} title={SOURCE_FILE_NAME[data.language]} lineNumbers />
      )}
    </div>
  )
}
