import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useState } from 'react'
import { Link, useParams } from 'react-router'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { AdminReportDetail, AdminReportUpdate, ReportStatus } from '@/api/types'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Alert } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RadioGroup } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { problemCode, problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { REPORT_TYPE_LABEL } from '@/features/problems/labels'
import { hasNul, REPORT_CONTENT_MAX, reportLength } from '@/features/solve/reportRules'
import { cn } from '@/lib/utils'
import { ADMIN_REPORTS_KEY, adminReportQuery } from './adminReportQuery'
import { REPORT_STATUS_HINT, REPORT_STATUS_LABEL, REPORT_STATUS_TONE } from './labels'

const REPORTED_AT = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** 시안은 '2026년 11월 9일 21:47'이다 */
function formatReportedAt(iso: string) {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '—' : REPORTED_AT.format(at)
}

const CHOOSABLE: Exclude<ReportStatus, 'PROBLEM_DELETED'>[] = [
  'RECEIVED',
  'IN_PROGRESS',
  'RESOLVED',
  'REJECTED',
]

/** 관리자 신고 상세 (ADM-13). 신고 내용은 읽기만 하고, 상태와 관리자 메모를 저장한다 */
export function Component() {
  const id = Number(useParams().id)
  const valid = Number.isSafeInteger(id) && id > 0
  const { data, error, refetch } = useQuery({ ...adminReportQuery(id), enabled: valid })

  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  if (!valid || problemCode(error) === 'REPORT_NOT_FOUND') {
    return (
      <EmptyState
        title="신고를 찾을 수 없어요"
        description="주소가 맞는지 확인하거나 신고 목록에서 다시 골라 주세요."
        action={{ label: '신고 목록으로', to: '/admin/reports' }}
      />
    )
  }
  if (error) return <ErrorState problem={error} onRetry={() => void refetch()} />
  if (!data) return <ListSkeleton rows={6} />

  const deleted = data.problemId === null
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="page-title">
          신고 <span className="tabular-nums">#{data.id}</span>
        </h1>
        <Badge tone={REPORT_STATUS_TONE[data.status]}>{REPORT_STATUS_LABEL[data.status]}</Badge>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="report-info"
          className="bg-card flex flex-col gap-5 rounded-lg border p-6"
        >
          <h2 id="report-info" className="text-foreground text-lg font-bold">
            신고 내용
          </h2>
          <dl className="m-0 grid grid-cols-[96px_minmax(0,1fr)] gap-x-4 gap-y-3 text-[15px]">
            <dt className="text-muted-foreground text-sm font-semibold">문제</dt>
            <dd className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1">
              {deleted ? (
                <>
                  <span className="text-muted-foreground break-keep [overflow-wrap:anywhere]">
                    {data.problemTitle}
                  </span>
                  <Badge tone="outline">삭제된 문제</Badge>
                </>
              ) : (
                <Link
                  to={`/admin/problems/${data.problemId}`}
                  className="hover:text-primary-text font-semibold break-keep [overflow-wrap:anywhere] hover:underline"
                >
                  {data.problemTitle}
                </Link>
              )}
              <span className="text-muted-foreground w-full font-mono text-[13px]">
                신고 당시 공개 버전 v{data.versionNo}
              </span>
            </dd>
            <dt className="text-muted-foreground text-sm font-semibold">유형</dt>
            <dd className="m-0">{REPORT_TYPE_LABEL[data.type]}</dd>
            <dt className="text-muted-foreground text-sm font-semibold">신고자</dt>
            {/* 회원 상세로 가는 링크는 회원 화면(#228)에서 붙인다 */}
            <dd className={cn('m-0', data.reporterNickname === null && 'text-muted-foreground')}>
              {data.reporterNickname ?? '탈퇴한 회원'}
            </dd>
            <dt className="text-muted-foreground text-sm font-semibold">신고일</dt>
            <dd className="m-0 tabular-nums">{formatReportedAt(data.createdAt)}</dd>
          </dl>
          <div className="flex flex-col gap-2">
            <span className="text-muted-foreground text-sm font-semibold">학습자가 쓴 내용</span>
            <blockquote className="bg-muted text-foreground m-0 rounded-md px-4 py-3 text-[15px] break-keep whitespace-pre-wrap [overflow-wrap:anywhere]">
              {data.content}
            </blockquote>
            <span className="text-muted-foreground text-[13px]">
              신고 내용은 누구도 고칠 수 없어요.
            </span>
          </div>
        </section>

        <HandleForm report={data} />
      </div>
    </section>
  )
}

/**
 * 처리 칸. 받은 값으로 한 번 채우고 그 뒤는 관리자가 고친 값을 둔다 — 저장 뒤 다시 받아도 쓰던 메모를 덮지 않는다.
 * 보낼 수 있는 상태는 계약의 규칙 1~3이다(문제가 있으면 넷, 지워진 처리 완료·반려는 그 둘, 문제 삭제됨은 메모만).
 */
function HandleForm({ report }: { report: AdminReportDetail }) {
  const queryClient = useQueryClient()
  const memoId = useId()
  const [status, setStatus] = useState<ReportStatus>(report.status)
  const [memo, setMemo] = useState(report.adminMemo ?? '')

  const save = useMutation({
    mutationFn: async (input: AdminReportUpdate) => {
      const result = await api.PUT('/api/admin/reports/{id}', {
        params: { path: { id: report.id } },
        body: input,
      })
      if (!result.response.ok) fail(result)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ADMIN_REPORTS_KEY] }),
    onError: async (error) => {
      forgetSessionIfUnauthorized(queryClient, error)
      // 저장하는 사이 문제가 지워져 상태가 바뀌었다(계약). 다시 받아 지금 상태로 맞춘다. 쓰던 메모는 둔다
      if (problemCode(error) === 'REPORT_PROBLEM_DELETED') {
        const fresh = await queryClient.fetchQuery({ ...adminReportQuery(report.id), staleTime: 0 })
        setStatus(fresh.status)
        void queryClient.invalidateQueries({ queryKey: [ADMIN_REPORTS_KEY, 'list'] })
      }
    },
  })

  // 값을 고치면 지난 저장 결과(완료·오류)는 더 맞지 않는다
  const edited = () => {
    if (!save.isIdle) save.reset()
  }

  const length = reportLength(memo)
  const nul = hasNul(memo)
  const canSave = !save.isPending && length <= REPORT_CONTENT_MAX && !nul
  // 지금 받은 값 기준이다. 저장하다 문제가 지워진 뒤 다시 받으면 여기도 바뀐다
  const problemGone = report.problemId === null

  return (
    <section
      aria-labelledby="report-handle"
      className="bg-card flex flex-col gap-5 rounded-lg border p-6"
    >
      <h2 id="report-handle" className="text-foreground text-lg font-bold">
        처리
      </h2>

      {report.status === 'PROBLEM_DELETED' ? (
        // 화면에 처음부터 있는 안내라 알리지 않는다. 저장 중에 바뀌었으면 서버 문구(role=alert)가 알린다
        <Alert tone="info" title="상태를 바꿀 수 없어요" live={false}>
          문제가 삭제돼서 이 신고는 &apos;문제 삭제됨&apos;으로 바뀌었어요. 메모는 남길 수 있어요.
        </Alert>
      ) : (
        <div className="flex flex-col gap-2">
          <RadioGroup
            label="상태"
            name="report-status"
            variant="card"
            // 시안은 두 줄 두 칸이다. 기본(160px)이면 반 폭 카드에 셋이 서고 하나가 남는다
            className="[&>div]:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]"
            options={CHOOSABLE.map((value) => ({
              value,
              label: REPORT_STATUS_LABEL[value],
              description: REPORT_STATUS_HINT[value],
              // 문제가 없으면 처리할 것이 없다 — 처리 안 한 상태로 되돌리지 못한다(규칙 2)
              disabled:
                save.isPending ||
                (problemGone && (value === 'RECEIVED' || value === 'IN_PROGRESS')),
            }))}
            value={status === 'PROBLEM_DELETED' ? undefined : status}
            onChange={(next) => {
              setStatus(next)
              edited()
            }}
          />
          {problemGone ? (
            <p className="text-muted-foreground text-[13px]">
              문제가 삭제돼서 처리 완료와 반려 사이만 바꿀 수 있어요.
            </p>
          ) : null}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={memoId} className="text-foreground text-sm font-semibold">
          관리자 메모
        </label>
        <Textarea
          id={memoId}
          rows={5}
          placeholder="관리자끼리만 보는 메모예요."
          value={memo}
          readOnly={save.isPending}
          onChange={(event) => {
            setMemo(event.target.value)
            edited()
          }}
          aria-invalid={length > REPORT_CONTENT_MAX || nul || undefined}
          aria-describedby={nul ? `${memoId}-nul ${memoId}-count` : `${memoId}-count`}
        />
        {nul ? (
          <span id={`${memoId}-nul`} className="text-destructive-text text-[13px]">
            보낼 수 없는 글자(널 문자)가 들어 있어요. 지우고 다시 써 주세요.
          </span>
        ) : null}
        <span
          id={`${memoId}-count`}
          className={cn(
            'self-end text-xs tabular-nums',
            length > REPORT_CONTENT_MAX ? 'text-destructive-text' : 'text-muted-foreground',
          )}
        >
          {length.toLocaleString()} / {REPORT_CONTENT_MAX.toLocaleString()}
        </span>
      </div>

      {save.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {problemMessage(save.error)}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {/* 저장 결과를 알리는 자리는 늘 둔다. 내용이 바뀔 때 생기면 화면 낭독기가 놓친다 */}
        <p role="status" className="text-success-text mr-auto text-sm">
          {save.isSuccess ? '저장했어요.' : ''}
        </p>
        <Button asChild variant="ghost">
          <Link to="/admin/reports">목록으로</Link>
        </Button>
        <Button disabled={!canSave} onClick={() => save.mutate({ status, adminMemo: memo })}>
          {save.isPending ? '저장하는 중…' : '저장'}
        </Button>
      </div>
    </section>
  )
}
