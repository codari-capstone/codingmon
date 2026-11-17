import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { cn } from '@/lib/utils'
import { ADMIN_PAGE_SIZE } from './adminProblemQuery'
import { adminUserListQuery, type AdminUserFilter } from './adminUserQuery'

/** 검색어를 조회에 반영하기까지 기다리는 시간. 문제 관리 목록과 같은 값이다 */
const SEARCH_DEBOUNCE_MS = 300

const FILTERS = [
  { value: 'ALL', label: '전체', count: 'all' },
  { value: 'ACTIVE', label: '정상', count: 'active' },
  { value: 'SUSPENDED', label: '정지', count: 'suspended' },
] as const satisfies readonly { value: AdminUserFilter; label: string; count: string }[]

// en-CA는 2026-11-03 모양이다(시안). 받은 시각은 UTC라 한국 날짜로 바꾼다
const KST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })

/** 가입일. 기록하기 전에 가입한 회원은 null이고 '—'로 보인다(계약) */
function formatJoinedOn(iso: string | null) {
  if (iso === null) return '—'
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '—' : KST_DATE.format(at)
}

/** 관리자 회원 목록 (ADM-14). 최근 가입순이다 */
export function Component() {
  const [draft, setDraft] = useState('')
  // 탭·검색어·페이지를 한 상태로 둔다. 바꾸면 1페이지로 가야 하는데, 따로 두면 옛 조건으로 한 번 더 받는다
  const [params, setParams] = useState<{ filter: AdminUserFilter; keyword: string; page: number }>({
    filter: 'ALL',
    keyword: '',
    page: 1,
  })
  const { filter, keyword, page } = params

  const { data, isPending, isFetching, error, refetch } = useQuery({
    ...adminUserListQuery(params),
    // 탭·검색·페이지를 바꾸는 동안 이전 표를 둔다(문제 관리 목록과 같은 선택)
    placeholderData: keepPreviousData,
  })

  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  // 공백을 떼고 보낸다. 공백만 치면 서버는 전체를 주는데 화면은 '조건에 맞는 회원'이라고 말하게 된다
  useEffect(() => {
    const trimmed = draft.trim()
    if (trimmed === keyword) return
    const timer = setTimeout(
      () => setParams((prev) => ({ ...prev, keyword: trimmed, page: 1 })),
      SEARCH_DEBOUNCE_MS,
    )
    return () => clearTimeout(timer)
  }, [draft, keyword])

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
        <h1 className="page-title">회원</h1>
      </div>

      <Tabs
        value={filter}
        onValueChange={(next) =>
          setParams((prev) => ({ ...prev, filter: next as AdminUserFilter, page: 1 }))
        }
        className="gap-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList variant="pill" aria-label="회원 상태">
            {FILTERS.map((item) => (
              <TabsTrigger key={item.value} value={item.value}>
                {item.label}
                {/* 검색어만 반영한 개수라 어느 탭에서 받아도 같다(계약) */}
                <span className="text-muted-foreground tabular-nums">
                  {data?.counts[item.count] ?? ''}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
          <SearchInput
            aria-label="이메일 · 닉네임 · ID로 검색"
            placeholder="이메일 · 닉네임 · ID로 검색"
            className="w-[300px] max-w-full"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </div>

        <TabsContent value={filter} className="flex flex-col gap-6">
          {isPending && !error ? <ListSkeleton rows={ADMIN_PAGE_SIZE} /> : null}

          {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

          {data && !error && !isPending ? (
            data.content.length === 0 ? (
              page > 1 ? (
                <EmptyState
                  title="이 페이지에는 회원이 없어요"
                  description="결과가 줄어 이 페이지는 비었어요. 앞 페이지로 돌아가세요."
                />
              ) : keyword ? (
                <EmptyState title="조건에 맞는 회원이 없어요" description="검색어를 바꿔 보세요." />
              ) : (
                <EmptyState
                  title={filter === 'SUSPENDED' ? '정지된 회원이 없어요' : '아직 회원이 없어요'}
                />
              )
            ) : (
              <div
                aria-busy={isFetching}
                className={cn('bg-card rounded-lg border px-3 py-2', isFetching && 'opacity-60')}
              >
                {/* 좁은 화면에서는 열을 짜내지 않고 표 안에서 가로로 민다(문제 목록과 같다) */}
                <Table className="min-w-[640px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">ID</TableHead>
                      <TableHead>닉네임</TableHead>
                      <TableHead>이메일</TableHead>
                      <TableHead className="w-32">가입일</TableHead>
                      <TableHead className="w-20">상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.content.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {user.id}
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-2.5 font-medium">
                            {/* 바로 옆 글자가 닉네임이라 아바타는 장식이다. 두면 줄마다 이름을 두 번 읽는다 */}
                            <span aria-hidden="true" className="flex shrink-0">
                              <Avatar name={user.nickname} size={28} />
                            </span>
                            {user.nickname}
                            {user.role === 'ADMIN' ? <Badge tone="brand">관리자</Badge> : null}
                          </span>
                        </TableCell>
                        <TableCell className={cn(user.email === null && 'text-muted-foreground')}>
                          {/* GitHub로 가입한 회원은 이메일이 없다(계약) */}
                          {user.email ?? '(GitHub)'}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'tabular-nums',
                            user.createdAt === null && 'text-muted-foreground',
                          )}
                        >
                          {formatJoinedOn(user.createdAt)}
                        </TableCell>
                        <TableCell>
                          {/* 관리자는 정지할 수 없어 늘 정상이다(계약) */}
                          {user.suspendedAt === null ? (
                            <Badge tone="success">정상</Badge>
                          ) : (
                            <Badge tone="danger">정지</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-muted-foreground text-sm">
              가입일이 &apos;—&apos;인 회원은 가입일 기록을 시작하기 전에 가입한 회원이에요.
            </p>
            {/* 결과 범위 밖 페이지(빈 표)에서도 '이전'으로 돌아갈 길이라 표 밖에 둔다 */}
            {data && !error && !isPending && (pages > 1 || page > 1) ? (
              <Pagination page={page} total={pages} onChange={handlePageChange} />
            ) : null}
          </div>
        </TabsContent>
      </Tabs>
    </section>
  )
}
