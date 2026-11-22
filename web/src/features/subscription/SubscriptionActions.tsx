import { useState } from 'react'

import type { Subscription } from '@/api/types'
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
import { Checkbox } from '@/components/ui/checkbox'
import { Modal } from '@/components/ui/dialog'
import { problemCode, problemMessage } from '@/features/auth/problemCode'
import { CYCLE_NAME, proCharge, won, type Cycle } from '@/features/pricing/plans'
import { fromBillingCycle, type SubscriptionAction } from './subscriptionQuery'
import { type ActionMutation, PLAN_TITLE_ID } from './useSubscriptionAction'

const DONE = (action: SubscriptionAction, s: Subscription) =>
  action.kind === 'cancel'
    ? '해지했어요.'
    : action.kind === 'resume'
      ? '해지를 취소했어요. 다음 결제일에 이어서 결제돼요.'
      : s.nextCycle
        ? `다음 결제부터 ${CYCLE_NAME[fromBillingCycle(s.nextCycle)]}으로 바꿨어요.`
        : '주기 바꾸기를 취소했어요.'

/** 주기 바꾸기 창에서 난 오류 중 창을 닫게 하는 것(진행 중이 아님). 그 오류는 카드 아래에 보인다 */
const closesModal = (act: ActionMutation) => problemCode(act.error) === 'SUBSCRIPTION_NOT_ACTIVE'

/**
 * 결과 알림. 플랜 카드 맨 아래에 둔다. status 자리는 비어 있어도 늘 둔다 — 숨겼다 보이면
 * 영역이 새로 생긴 것으로 보여 일부 낭독기가 읽지 않는다(#357 리뷰). 비었을 때는 여백만 없앤다.
 */
export function ActionResult({ act }: { act: ActionMutation }) {
  const inModal = act.variables?.kind === 'cycle' && act.variables.agreed && !closesModal(act)
  return (
    <>
      {/* 주기 바꾸기 창의 오류는 창 안에 보인다 */}
      {act.isError && !inModal ? (
        <p role="alert" className="text-destructive-text m-0 mt-4 text-sm">
          {problemMessage(act.error)}
        </p>
      ) : null}
      <p role="status" className="text-success-text m-0 mt-4 text-sm empty:mt-0">
        {act.isSuccess ? DONE(act.variables, act.data) : ''}
      </p>
    </>
  )
}

/** 플랜 카드 오른쪽 버튼. 진행 중이면 주기 바꾸기(바꾸지 않았을 때만)·해지, 해지 예정이면 해지 취소 */
export function PlanActions({
  subscription: s,
  end,
  act,
}: {
  subscription: Subscription
  /** 'M월 D일' */
  end: string
  act: ActionMutation
}) {
  const [changeOpen, setChangeOpen] = useState(false)
  const busy = act.isPending ? act.variables.kind : null
  const cycle: Cycle = s.cycle ? fromBillingCycle(s.cycle) : 'monthly'
  const other: Cycle = cycle === 'monthly' ? 'yearly' : 'monthly'
  // 창을 연 채 진행 중이 아니게 되면 창이 사라진다. 열림을 남기면 다시 진행 중이 될 때 저절로 열린다(#357 리뷰)
  if (s.status !== 'ACTIVE' && changeOpen) setChangeOpen(false)

  if (s.status === 'CANCEL_SCHEDULED') {
    return (
      // 처리 중에도 disabled로 두지 않는다. 브라우저가 포커스를 빼앗는다(관리자 회원 조치와 같다)
      <Button
        type="button"
        aria-disabled={act.isPending || undefined}
        aria-busy={busy === 'resume' || undefined}
        onClick={() => {
          if (!act.isPending) act.mutate({ kind: 'resume' })
        }}
      >
        {busy === 'resume' ? '취소하는 중…' : '해지 취소'}
      </Button>
    )
  }
  if (s.status !== 'ACTIVE') return null

  return (
    <div className="flex flex-wrap gap-2">
      {/* 바꾼 뒤에는 카드 안 띠의 [바꾸기 취소]만 둔다(디자인) */}
      {s.nextCycle && s.nextCycle !== s.cycle ? null : (
        <Button
          type="button"
          variant="secondary"
          aria-disabled={act.isPending || undefined}
          onClick={() => {
            if (act.isPending) return
            act.reset()
            setChangeOpen(true)
          }}
        >
          {CYCLE_NAME[other]}으로 바꾸기
        </Button>
      )}
      <CancelButton subscription={s} end={end} act={act} />
      <ChangeCycleModal
        open={changeOpen}
        onClose={() => setChangeOpen(false)}
        to={other}
        end={end}
        act={act}
      />
    </div>
  )
}

function CancelButton({
  subscription: s,
  end,
  act,
}: {
  subscription: Subscription
  end: string
  act: ActionMutation
}) {
  const busy = act.isPending && act.variables.kind === 'cancel'
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          aria-disabled={act.isPending || undefined}
          aria-busy={busy || undefined}
          onClick={(event) => {
            if (act.isPending) event.preventDefault()
            else act.reset()
          }}
        >
          {busy ? '해지하는 중…' : '해지'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>프로 구독을 해지할까요?</AlertDialogTitle>
          <AlertDialogDescription>
            {/* 갱신 결제의 결과를 모르면 결제됐을 때의 기간을 보여 준다(계약 currentPeriodEnd) */}
            {s.paymentPending ? (
              `갱신 결제를 확인하고 있어요. 결제되면 ${end}까지 프로로 쓸 수 있고, 결제되지 않으면 바로 무료로 바뀌어요.`
            ) : (
              <>
                <strong className="text-foreground">{end}까지</strong> 프로로 쓸 수 있어요. 그
                뒤에는 무료로 바뀌고 더 결제되지 않아요.
              </>
            )}
            {s.nextCycle && s.nextCycle !== s.cycle
              ? ' 해지하면 주기 바꾸기도 함께 취소돼요.'
              : null}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>계속 쓸게요</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={() => act.mutate({ kind: 'cancel' })}>
            해지
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ChangeCycleModal({
  open,
  onClose,
  to,
  end,
  act,
}: {
  open: boolean
  onClose: () => void
  to: Cycle
  end: string
  act: ActionMutation
}) {
  // 동의는 본 조건(주기·날짜)에 묶는다. 창을 연 채 구독이 새로 들어와 조건이 바뀌면 다시 체크받는다(#357 리뷰)
  const terms = `${to}|${end}`
  const [agreedTo, setAgreedTo] = useState<string | null>(null)
  const agreed = agreedTo === terms
  const pending = act.isPending && act.variables.kind === 'cycle'
  const close = () => {
    if (pending) return
    setAgreedTo(null)
    // 창 안에서 본 오류를 닫은 뒤 카드 아래에 다시 띄우지 않는다(낭독기가 두 번 읽는다)
    if (act.isError) act.reset()
    onClose()
  }
  return (
    <Modal
      open={open}
      onClose={close}
      // 바꾸면 연 버튼이 사라진다. 그대로 두면 포커스가 body로 떨어진다(#357 리뷰)
      fallbackFocus={() => document.getElementById(PLAN_TITLE_ID)}
      title={`${CYCLE_NAME[to]}으로 바꿀까요?`}
      description={
        <>
          지금 기간({end}까지)은 그대로예요.{' '}
          <strong className="text-foreground">
            {end}부터 {CYCLE_NAME[to]} {won(proCharge(to))}원
          </strong>
          이 자동결제돼요.
        </>
      }
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            aria-disabled={pending || undefined}
            onClick={close}
          >
            취소
          </Button>
          <Button
            type="button"
            disabled={!agreed}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
            onClick={() => {
              if (pending) return
              act.mutate(
                { kind: 'cycle', cycle: to, agreed: true },
                {
                  onSuccess: () => {
                    setAgreedTo(null)
                    onClose()
                  },
                  // 진행 중이 아니게 됐다(다른 탭에서 해지 등). 이 창은 더 쓸 수 없으니 닫고 오류는 카드 아래에 둔다(#357 리뷰)
                  onError: (error) => {
                    if (problemCode(error) !== 'SUBSCRIPTION_NOT_ACTIVE') return
                    setAgreedTo(null)
                    onClose()
                  },
                },
              )
            }}
          >
            {pending ? '바꾸는 중…' : `${CYCLE_NAME[to]}으로 바꾸기`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="bg-muted rounded-[16px] px-5 py-2">
          <Checkbox
            label="(필수) 바뀐 금액의 자동결제에 동의합니다"
            checked={agreed}
            disabled={pending}
            onChange={(e) => setAgreedTo(e.target.checked ? terms : null)}
          />
        </div>
        {act.isError && !closesModal(act) ? (
          <p role="alert" className="text-destructive-text m-0 text-sm">
            {problemMessage(act.error)}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}

/** 주기를 바꾼 뒤 카드 안 띠: 다음 결제부터 새 주기 + [바꾸기 취소] (MY-06) */
export function NextCycleBand({
  subscription: s,
  end,
  act,
}: {
  subscription: Subscription
  end: string
  act: ActionMutation
}) {
  if (s.status !== 'ACTIVE' || !s.nextCycle || !s.cycle || s.nextCycle === s.cycle) return null
  const next = fromBillingCycle(s.nextCycle)
  const busy = act.isPending && act.variables.kind === 'cycle'
  return (
    <div className="bg-accent mt-6 flex flex-wrap items-center gap-3 rounded-[16px] px-5 py-4">
      <p className="text-body-foreground m-0 min-w-[220px] flex-1 text-[15px] break-keep">
        <strong className="text-primary-text">다음 결제부터 {CYCLE_NAME[next]}</strong> · {end}부터{' '}
        {next === 'yearly' ? '연' : '월'} {won(proCharge(next))}원이 자동결제돼요.
      </p>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-disabled={act.isPending || undefined}
        aria-busy={busy || undefined}
        onClick={() => {
          // 지금 주기를 보내면 바꾸기 취소다. 동의는 필요 없다(계약)
          if (!act.isPending)
            act.mutate({ kind: 'cycle', cycle: fromBillingCycle(s.cycle!), agreed: false })
        }}
      >
        {busy ? '취소하는 중…' : '바꾸기 취소'}
      </Button>
    </div>
  )
}
