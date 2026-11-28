import { useQuery, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import type { Subscription } from '@/api/types'
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
import { formatJoinedOn, planName } from './labels'

/** 검색어를 조회에 반영하기까지 기다리는 시간. 문제 관리 목록과 같은 값이다 */
const SEARCH_DEBOUNCE_MS = 300

const FILTERS = [
  { value: 'ALL', label: '전체', count: 'all' },
  { value: 'ACTIVE', label: '정상', count: 'active' },
  { value: 'SUSPENDED', label: '정지', count: 'suspended' },
] as const satisfies readonly { value: AdminUserFilter; label: string; count: string }[]

/**
 * 요금제 칸 (ADM-14). 프로만 굵게 한다. 결제 실패는 '프로 월간'이지만 지금은 무료라 굵게 하지 않는다.
 * shortcut: 목록 응답에 회원별 `needsCancel`이 없어 '취소·확인 필요'는 그 필터로 들어왔을 때만 단다. 계약에 값이 생기면 그걸 쓴다
 */
function PlanCell({
  subscription,
  needsCancel,
}: {
  subscription: Subscription
  needsCancel: boolean
}) {
  const { plan, status } = subscription
  const name = planName(subscription)
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      {plan === 'PRO' ? (
        <b>{name}</b>
      ) : (
        <span className={cn(name === '무료' && 'text-muted-foreground')}>{name}</span>
      )}
      {status === 'CANCEL_SCHEDULED' ? <Badge tone="warning">해지 예정</Badge> : null}
      {status === 'PAYMENT_FAILED' ? <Badge tone="danger">결제 실패</Badge> : null}
      {needsCancel ? <Badge tone="danger">취소·확인 필요</Badge> : null}
    </span>
  )
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
  // 대시보드의 '취소·확인이 필요한 결제' 카드가 주소로 넘긴다(ADM-12)
  const [searchParams, setSearchParams] = useSearchParams()
  const needsCancel = searchParams.get('paymentNeedsCancel') === 'true'
  // ×뿐 아니라 헤더 링크·뒤로 가기로 주소만 바뀌어도 1페이지로 간다. 렌더 중에 맞춰 옛 페이지로 한 번 더 받지 않는다
  const [shownNeedsCancel, setShownNeedsCancel] = useState(needsCancel)
  if (shownNeedsCancel !== needsCancel) {
    setShownNeedsCancel(needsCancel)
    setParams((prev) => ({ ...prev, page: 1 }))
  }

  const { data, isPending, isFetching, error, refetch } = useQuery({
    ...adminUserListQuery({ ...params, paymentNeedsCancel: needsCancel }),
    // 포트원 콘솔에서 처리하고 돌아오면 대상 회원을 새로 받는다(대시보드 카드 수와 같다)
    refetchOnWindowFocus: needsCancel,
    // 탭·검색·페이지를 바꾸는 동안 이전 표를 둔다(문제 관리 목록과 같은 선택).
    // 필터가 바뀔 때는 두지 않는다. 걸러지지 않은 회원에 '취소·확인 필요'가 붙어 보인다
    placeholderData: (previous, previousQuery) =>
      (previousQuery?.queryKey[2].paymentNeedsCancel ?? false) === needsCancel
        ? previous
        : undefined,
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
          {needsCancel ? (
            <span className="bg-destructive-soft text-destructive-text mr-auto inline-flex h-8 items-center gap-1 rounded-full pr-1 pl-3 text-sm font-semibold">
              취소·확인이 필요한 결제만
              {data ? <span className="tabular-nums"> · {data.counts.all}명</span> : null}
              <button
                type="button"
                aria-label="취소·확인이 필요한 결제 필터 지우기"
                className="hover:bg-destructive/10 grid size-6 place-items-center rounded-full"
                onClick={() => {
                  // 기록을 쌓지 않는다. 쌓으면 뒤로 가기로 필터만 돌아오고 페이지 상태는 남아 어긋난다
                  setSearchParams({}, { replace: true })
                }}
              >
                <X aria-hidden className="size-4" />
              </button>
            </span>
          ) : null}
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
              // 비어도 표와 같은 상자에 둔다. 상자 없이 펭귄만 뜨면 표 자리가 사라진 것처럼 보인다
              <div className="bg-card rounded-lg border">
                {page > 1 ? (
                  <EmptyState
                    title="이 페이지에는 회원이 없어요"
                    description="결과가 줄어 이 페이지는 비었어요. 앞 페이지로 돌아가세요."
                  />
                ) : keyword ? (
                  <EmptyState
                    title="조건에 맞는 회원이 없어요"
                    description="검색어를 바꿔 보세요."
                  />
                ) : needsCancel && data.counts.all === 0 ? (
                  <EmptyState title="취소·확인이 필요한 결제가 있는 회원이 없어요" />
                ) : needsCancel && filter === 'ACTIVE' ? (
                  // 대상은 있는데 고른 탭에만 없다. 칩의 'N명'과 어긋나지 않게 탭 기준으로 말한다
                  <EmptyState title="정상 상태인 회원이 없어요" />
                ) : (
                  <EmptyState
                    title={filter === 'SUSPENDED' ? '정지된 회원이 없어요' : '아직 회원이 없어요'}
                  />
                )}
              </div>
            ) : (
              <div
                aria-busy={isFetching}
                className={cn('bg-card rounded-lg border px-3 py-2', isFetching && 'opacity-60')}
              >
                {/* 좁은 화면에서는 열을 짜내지 않고 표 안에서 가로로 민다(문제 목록과 같다) */}
                <Table className="min-w-[880px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">ID</TableHead>
                      <TableHead>닉네임</TableHead>
                      <TableHead>이메일</TableHead>
                      <TableHead className="w-32">가입일</TableHead>
                      <TableHead>요금제</TableHead>
                      <TableHead className="w-32">마감일</TableHead>
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
                            <Link
                              to={`/admin/members/${user.id}`}
                              className="hover:text-primary-text break-keep [overflow-wrap:anywhere] hover:underline"
                            >
                              {user.nickname}
                            </Link>
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
                          <PlanCell subscription={user.subscription} needsCancel={needsCancel} />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'tabular-nums',
                            user.subscription.currentPeriodEnd === null && 'text-muted-foreground',
                          )}
                        >
                          {/* 진행 중이면 다음 결제일, 해지 예정이면 프로가 끝나는 날. 그 밖에는 null이라 '—'(계약) */}
                          <span className="flex items-center gap-1.5 whitespace-nowrap">
                            {formatJoinedOn(user.subscription.currentPeriodEnd)}
                            {/* 결과를 모르는 갱신 결제가 있으면 그 결제가 됐을 때의 날짜다. 보여 주기만 하는 값(계약) */}
                            {user.subscription.paymentPending &&
                            user.subscription.currentPeriodEnd !== null ? (
                              <Badge tone="info">확정 전</Badge>
                            ) : null}
                          </span>
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
            {/* 표가 있을 때만 단다. 오류·로딩·빈 결과에서는 가리킬 '—'가 없다(#316 리뷰) */}
            {data && !error && !isPending && data.content.length > 0 ? (
              <p className="text-muted-foreground text-sm">
                가입일이 &apos;—&apos;인 회원은 가입일 기록을 시작하기 전에 가입한 회원이에요.
                마감일은 진행 중이면 다음 결제일, 해지 예정이면 프로가 끝나는 날이에요. &apos;확정
                전&apos;은 결과를 모르는 갱신 결제가 됐을 때의 날짜예요.
              </p>
            ) : (
              <span />
            )}
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
