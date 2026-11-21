import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useParams } from 'react-router'

import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { LoadingState } from '@/components/LoadingState'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { problemCode } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import {
  adminUserQuery,
  adminUserSolvedQuery,
  adminUserSubmissionsQuery,
  WITHDRAW_AFTER_MS,
} from './adminUserQuery'
import { formatJoinedOn } from './labels'
import { MemberActions } from './MemberActions'
import { MemberSubmissions } from './MemberSubmissions'

/** 올해 것과 지난해 것(연도를 붙임) 한 쌍. 해가 다른 날을 가른다(formatSubmittedAt과 같은 선택) */
function kstFormats(options: Intl.DateTimeFormatOptions) {
  const base = { ...options, timeZone: 'Asia/Seoul' }
  return {
    thisYear: new Intl.DateTimeFormat('ko-KR', base),
    otherYear: new Intl.DateTimeFormat('ko-KR', { ...base, year: 'numeric' }),
  }
}
const AT = kstFormats({
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const DAY = kstFormats({ month: 'long', day: 'numeric' })
const YEAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric' })

function format(formats: ReturnType<typeof kstFormats>, iso: string, now = new Date()) {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  return (YEAR.format(at) === YEAR.format(now) ? formats.thisYear : formats.otherYear).format(at)
}

/** AI 사용량이 다시 채워지는 한국 시각('오전 9시'). Intl의 오전·오후 표기는 실행 환경마다 달라 직접 만든다 */
function kstHour(iso: string) {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  const hour = (at.getUTCHours() + 9) % 24
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}시`
}

/** 관리자 회원 상세 (ADM-15·16) */
export function Component() {
  const id = Number(useParams().id)
  const valid = Number.isSafeInteger(id) && id > 0
  const {
    data: user,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    ...adminUserQuery(id),
    enabled: valid,
    // 앱 기본값(false)을 이 화면만 켠다. 탭에 돌아오면 정지 상태·24시간 판정·오늘 AI 사용량을 새로 받는다
    refetchOnWindowFocus: true,
  })
  const solved = useQuery({ ...adminUserSolvedQuery(id), enabled: valid })
  // 첫 페이지의 totalElements가 강제 탈퇴 창의 '지워질 제출' 수다. 목록 카드와 같은 키라 한 번만 받는다
  const submissions = useQuery({ ...adminUserSubmissionsQuery(id, 1), enabled: valid })
  // 24시간 계산의 '지금'은 상세를 받은 시각이다. 정지하고 다시 받으면 함께 바뀐다(화면을 연 시각이면
  // 방금 정지한 회원이 '25시간 남음'이 된다).
  // shortcut: 탭을 떠나지 않고 띄워 두기만 하면 남은 시간이 줄지 않는다. 탭에 돌아오거나 다시 열면 맞는다
  const now = dataUpdatedAt

  // 보조 쿼리(푼 문제, 제출 1페이지)의 401도 세션을 정리한다. 상세만 보면 로그인 화면으로 가지 않고 오류만 남는다.
  // 제출 카드가 다른 페이지에 있으면 1페이지를 지켜보는 곳은 여기뿐이다
  const queryClient = useQueryClient()
  // 셋을 따로 본다. ??로 이으면 상세가 500일 때 뒤의 401을 보지 못한다(#318 리뷰)
  useEffect(() => {
    for (const each of [error, solved.error, submissions.error]) {
      forgetSessionIfUnauthorized(queryClient, each)
    }
  }, [queryClient, error, solved.error, submissions.error])

  if (!valid || problemCode(error) === 'USER_NOT_FOUND') {
    return (
      <EmptyState
        title="회원을 찾을 수 없어요"
        description="탈퇴했거나 주소가 맞지 않아요. 회원 목록에서 다시 골라 주세요."
        action={{ label: '회원 목록으로', to: '/admin/members' }}
      />
    )
  }
  if (error && !user) return <ErrorState problem={error} onRetry={() => void refetch()} />
  if (!user) return <LoadingState />

  const suspendedAt = user.suspendedAt
  const withdrawable =
    suspendedAt !== null && now - new Date(suspendedAt).getTime() >= WITHDRAW_AFTER_MS

  return (
    <section className="flex flex-col gap-6">
      <Breadcrumb items={[{ label: '회원', href: '/admin/members' }, { label: user.nickname }]} />

      {error ? (
        // 받아 둔 값이 있는데 다시 받기가 실패했다. 정지·해제 직후라면 버튼이 예전 상태일 수 있다(신고 상세와 같은 처리)
        <Alert
          tone="warning"
          title="최신 정보를 받지 못했어요"
          action={
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              다시 받기
            </Button>
          }
        >
          지금 보이는 정지 상태와 버튼이 바뀌었을 수 있어요.
        </Alert>
      ) : null}

      {suspendedAt !== null ? (
        // 화면에 처음부터 있는 상태라 알리지 않는다. 정지한 순간은 MemberActions가 알린다
        <Alert tone="danger" title="정지된 계정이에요" live={false}>
          {format(AT, suspendedAt)}에 정지했어요.{' '}
          {withdrawable ? '24시간이 지나 강제 탈퇴할 수 있어요. ' : ''}
          로그인과 토큰 갱신이 막혀 있어요.
          {user.suspensionReason ? (
            <span className="mt-1 block break-keep whitespace-pre-wrap [overflow-wrap:anywhere]">
              사유: {user.suspensionReason}
            </span>
          ) : null}
        </Alert>
      ) : null}

      <section
        aria-label="회원 정보"
        className="bg-card flex flex-wrap items-start gap-6 rounded-lg border p-6"
      >
        <span aria-hidden="true" className="flex shrink-0">
          <Avatar name={user.nickname} size={64} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title break-keep [overflow-wrap:anywhere]">{user.nickname}</h1>
            {user.role === 'ADMIN' ? <Badge tone="brand">관리자</Badge> : null}
            {suspendedAt === null ? (
              <Badge tone="success">정상</Badge>
            ) : (
              <Badge tone="danger">정지</Badge>
            )}
          </div>
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">ID</dt>
            <dd className="m-0 tabular-nums">{user.id}</dd>
            <dt className="text-muted-foreground">이메일</dt>
            <dd className="m-0 [overflow-wrap:anywhere]">{user.email ?? '(GitHub)'}</dd>
            <dt className="text-muted-foreground">가입 방법</dt>
            <dd className="m-0">{user.loginMethod === 'GITHUB' ? 'GitHub' : '이메일'}</dd>
            <dt className="text-muted-foreground">가입일</dt>
            <dd className="m-0 tabular-nums">
              {user.createdAt === null ? '— (기록 전 가입)' : formatJoinedOn(user.createdAt)}
            </dd>
          </dl>
        </div>
        <MemberActions
          user={user}
          now={now}
          submissionCount={submissions.data?.totalElements}
          solvedCount={solved.data?.length}
        />
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <MemberSubmissions userId={user.id} />

        <div className="flex min-w-0 flex-col gap-6">
          <section
            aria-labelledby="member-ai"
            className="bg-card flex flex-col gap-3 rounded-lg border p-6"
          >
            <h2 id="member-ai" className="text-lg font-bold">
              오늘 AI 사용
            </h2>
            {user.aiQuota.limit === null ? (
              // 관리자는 하루 한도가 없다(#343). 막대 대신 쓴 횟수만 보인다
              <p className="m-0 text-[15px]">
                AI 분석·리뷰{' '}
                <span className="font-semibold tabular-nums">{user.aiQuota.used}회</span>
                <span className="text-muted-foreground block text-[13px]">
                  관리자라 하루 한도가 없어요
                </span>
              </p>
            ) : (
              <>
                <Progress
                  label="AI 분석·리뷰"
                  value={user.aiQuota.used}
                  max={user.aiQuota.limit}
                  showValue
                />
                <span className="text-muted-foreground text-[13px]">
                  하루 한도 {user.aiQuota.limit}회 · {kstHour(user.aiQuota.resetsAt)}에 다시
                  채워져요
                </span>
              </>
            )}
          </section>

          <section
            aria-labelledby="member-solved"
            className="bg-card flex flex-col gap-3 rounded-lg border p-6"
          >
            <div className="flex items-baseline justify-between gap-4">
              <h2 id="member-solved" className="text-lg font-bold">
                푼 문제
              </h2>
              {solved.data ? (
                <span className="text-muted-foreground text-sm tabular-nums">
                  {solved.data.length}개
                </span>
              ) : null}
            </div>
            {solved.error ? (
              <ErrorState problem={solved.error} onRetry={() => void solved.refetch()} />
            ) : !solved.data ? (
              <ListSkeleton rows={4} />
            ) : solved.data.length === 0 ? (
              <p className="text-muted-foreground text-sm">아직 맞힌 문제가 없어요.</p>
            ) : (
              // 페이지 없이 모두 온다(계약). 카드가 길어지지 않게 안에서 스크롤한다.
              // 스크롤 영역에 키보드가 닿도록 tabIndex를 준다
              <div
                tabIndex={0}
                role="region"
                aria-label="푼 문제 목록"
                className="max-h-[360px] overflow-y-auto"
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>문제</TableHead>
                      <TableHead className="w-24">처음 푼 날</TableHead>
                      <TableHead className="w-14">시도</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {solved.data.map((item) => (
                      <TableRow key={item.problemId}>
                        <TableCell className="break-keep whitespace-normal [overflow-wrap:anywhere]">
                          {item.title}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {format(DAY, item.firstSolvedAt)}
                        </TableCell>
                        <TableCell className="tabular-nums">{item.attemptCount}회</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      </div>
    </section>
  )
}
