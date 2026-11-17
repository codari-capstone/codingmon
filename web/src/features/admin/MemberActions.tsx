import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useNavigate } from 'react-router'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { AdminUserDetail } from '@/api/types'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { problemCode, problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { reportLength } from '@/features/solve/reportRules'
import { cn } from '@/lib/utils'
import { ADMIN_REPORTS_KEY } from './adminReportQuery'
import { ADMIN_USERS_KEY, SUSPENSION_REASON_MAX, WITHDRAW_AFTER_MS } from './adminUserQuery'

type Action = { kind: 'suspend'; reason: string } | { kind: 'unsuspend' } | { kind: 'withdraw' }

const DONE: Record<Exclude<Action['kind'], 'withdraw'>, string> = {
  suspend: '계정을 정지했어요.',
  unsuspend: '정지를 풀었어요.',
}

/** 이 오류들은 화면이 본 상태가 낡았다는 뜻이다. 상세를 다시 받아 버튼을 지금 상태로 맞춘다 */
const STALE_CODES = [
  'USER_NOT_FOUND',
  'ADMIN_CANNOT_BE_SUSPENDED',
  'USER_NOT_SUSPENDED',
  'SUSPENSION_TOO_RECENT',
]

/**
 * 정지·해제·강제 탈퇴 (ADM-16). 관리자 계정에는 그리지 않는다(정지할 수 없다).
 * 강제 탈퇴는 정지 24시간 뒤에 켜지고, 지워질 제출·푼 문제 수를 보여 주는 경고 창을 거친다.
 */
export function MemberActions({
  user,
  now,
  submissionCount,
  solvedCount,
}: {
  user: AdminUserDetail
  now: number
  submissionCount: number | undefined
  solvedCount: number | undefined
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const reasonId = useId()
  const [suspendOpen, setSuspendOpen] = useState(false)
  const [reason, setReason] = useState('')

  const act = useMutation({
    mutationFn: async (action: Action) => {
      const path = { params: { path: { id: user.id } } }
      const result =
        action.kind === 'suspend'
          ? await api.POST('/api/admin/users/{id}/suspend', {
              ...path,
              body: { reason: action.reason === '' ? null : action.reason },
            })
          : action.kind === 'unsuspend'
            ? await api.POST('/api/admin/users/{id}/unsuspend', path)
            : await api.DELETE('/api/admin/users/{id}', path)
      if (!result.response.ok) fail(result)
    },
    onSuccess: async (_, action) => {
      if (action.kind === 'withdraw') {
        // 지운 회원의 상세를 다시 받으면 404만 온다. 목록·탭 개수와 신고자 칸('탈퇴한 회원')은 새로 받는다
        queryClient.removeQueries({ queryKey: [ADMIN_USERS_KEY, 'detail', user.id] })
        void queryClient.invalidateQueries({ queryKey: [ADMIN_USERS_KEY] })
        void queryClient.invalidateQueries({ queryKey: [ADMIN_REPORTS_KEY] })
        void navigate('/admin/members', { replace: true })
        return
      }
      setSuspendOpen(false)
      setReason('')
      await queryClient.invalidateQueries({ queryKey: [ADMIN_USERS_KEY] })
    },
    onError: (error) => {
      forgetSessionIfUnauthorized(queryClient, error)
      if (STALE_CODES.includes(problemCode(error) ?? '')) {
        setSuspendOpen(false)
        void queryClient.invalidateQueries({ queryKey: [ADMIN_USERS_KEY] })
      }
    },
  })

  if (user.role === 'ADMIN') return null

  const suspendedAt = user.suspendedAt === null ? null : new Date(user.suspendedAt).getTime()
  const waitMs = suspendedAt === null ? 0 : suspendedAt + WITHDRAW_AFTER_MS - now
  const canWithdraw = suspendedAt !== null && waitMs <= 0
  const reasonLength = reportLength(reason)
  const tooLong = reasonLength > SUSPENSION_REASON_MAX

  const hint =
    suspendedAt === null
      ? '정지하면 바로 로그인할 수 없고, 로그인 중인 기기도 로그아웃돼요.'
      : canWithdraw
        ? '강제 탈퇴는 되돌릴 수 없어요.'
        : `강제 탈퇴는 정지 24시간 뒤에 할 수 있어요 · ${Math.ceil(waitMs / 3_600_000)}시간 남음`

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        {suspendedAt === null ? (
          <Button
            type="button"
            variant="danger"
            disabled={act.isPending}
            onClick={() => {
              act.reset()
              setSuspendOpen(true)
            }}
          >
            계정 정지
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={act.isPending}
              onClick={() => act.mutate({ kind: 'unsuspend' })}
            >
              정지 해제
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="danger" disabled={!canWithdraw || act.isPending}>
                  강제 탈퇴
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    &apos;{user.nickname}&apos; 계정을 강제 탈퇴할까요?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    해당 회원의 모든 정보가 지워집니다. 회원 탈퇴와 똑같이 계정과 기록이 모두
                    지워지고 되돌릴 수 없어요.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <dl className="bg-muted m-0 grid grid-cols-[1fr_auto] gap-y-1 rounded-md px-4 py-3 text-sm">
                  <dt className="text-muted-foreground">지워질 제출</dt>
                  <dd className="m-0 font-semibold tabular-nums">{submissionCount ?? '–'}개</dd>
                  <dt className="text-muted-foreground">지워질 푼 문제</dt>
                  <dd className="m-0 font-semibold tabular-nums">{solvedCount ?? '–'}개</dd>
                </dl>
                {/* 회원별 신고 수를 주는 API가 없어 수는 적지 않는다 */}
                <p className="text-muted-foreground text-sm">
                  이 회원이 보낸 신고는 남고, 신고자는 &apos;탈퇴한 회원&apos;으로 바뀌어요.
                </p>
                <AlertDialogFooter>
                  <AlertDialogCancel>취소</AlertDialogCancel>
                  <AlertDialogAction
                    variant="danger"
                    onClick={() => act.mutate({ kind: 'withdraw' })}
                  >
                    강제 탈퇴
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
      <span className="text-muted-foreground text-[13px]">{hint}</span>

      {act.isError && !suspendOpen ? (
        <p role="alert" className="text-destructive-text text-sm">
          {problemMessage(act.error)}
        </p>
      ) : null}
      {/* 결과를 알리는 자리는 늘 둔다. 내용이 바뀔 때 생기면 화면 낭독기가 놓친다 */}
      <p role="status" className="text-success-text text-sm empty:hidden">
        {act.isSuccess && act.variables.kind !== 'withdraw' ? DONE[act.variables.kind] : ''}
      </p>

      <Modal
        open={suspendOpen}
        onClose={() => {
          if (!act.isPending) setSuspendOpen(false)
        }}
        title={`'${user.nickname}' 계정을 정지할까요?`}
        description="바로 로그인할 수 없고, 로그인 중인 기기도 로그아웃돼요. 정지하고 24시간이 지나면 강제 탈퇴할 수 있어요."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={act.isPending}
              onClick={() => setSuspendOpen(false)}
            >
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={act.isPending || tooLong}
              onClick={() => act.mutate({ kind: 'suspend', reason })}
            >
              {act.isPending ? '정지하는 중…' : '정지하기'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor={reasonId} className="text-sm font-semibold">
            정지 사유 <span className="text-muted-foreground font-normal">(선택)</span>
          </label>
          <Textarea
            id={reasonId}
            rows={4}
            placeholder="관리자끼리만 보는 사유예요."
            value={reason}
            readOnly={act.isPending}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={tooLong || undefined}
            aria-describedby={`${reasonId}-count`}
          />
          <span
            id={`${reasonId}-count`}
            className={cn(
              'self-end text-xs tabular-nums',
              tooLong ? 'text-destructive-text' : 'text-muted-foreground',
            )}
          >
            {reasonLength.toLocaleString()} / {SUSPENSION_REASON_MAX.toLocaleString()}
          </span>
          {act.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {problemMessage(act.error)}
            </p>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
