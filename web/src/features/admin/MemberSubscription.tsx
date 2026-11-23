import { Check, Copy } from 'lucide-react'

import type { AdminUserDetail } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CYCLE_NAME, won } from '@/features/pricing/plans'
import { fromBillingCycle } from '@/features/subscription/subscriptionQuery'
import { useCopy } from '@/lib/useCopy'
import { cn } from '@/lib/utils'
import { formatJoinedOn, PAYMENT_STATUS, planName, SUBSCRIPTION_STATUS } from './labels'

type Payment = AdminUserDetail['payments'][number]

/** 결제 시각 '2026-10-20 10:04'(한국 시각). sv-SE가 날짜를 ISO 순서로 쓴다 */
const PAID_AT = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function formatPaidAt(iso: string) {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '—' : PAID_AT.format(at)
}

/**
 * 구독 요약 (ADM-15). 회원 정보 카드의 오른쪽 칸이다.
 * 기간 끝 날짜는 진행 중이면 다음 결제일, 해지 예정이면 끝나는 날이다. 그 밖에는 null이라 줄을 두지 않는다(계약)
 */
export function SubscriptionSummary({ user }: { user: AdminUserDetail }) {
  const s = user.subscription
  // 구독 시작 결제의 결과를 모르면 아직 무료다(계약 `paymentPending`). 결제 시도가 없던 것처럼 보이지 않게 MY-06과 같이 알린다
  const starting = s.paymentPending && s.plan === 'FREE'
  const status = starting
    ? ({ label: '결제 확인 중', tone: 'info' } as const)
    : SUBSCRIPTION_STATUS[s.status]
  return (
    <section aria-labelledby="member-subscription" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 id="member-subscription" className="text-muted-foreground text-sm font-semibold">
          구독
        </h2>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="m-0 text-xl font-bold">{planName(s)}</p>
      {starting ? (
        <p className="text-muted-foreground m-0 text-sm">결제가 확인되면 프로로 바뀌어요.</p>
      ) : null}
      {user.subscriptionStartedAt !== null || s.currentPeriodEnd !== null ? (
        <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
          {user.subscriptionStartedAt !== null ? (
            <>
              <dt className="text-muted-foreground">구독 시작일</dt>
              <dd className="m-0 tabular-nums">{formatJoinedOn(user.subscriptionStartedAt)}</dd>
            </>
          ) : null}
          {s.currentPeriodEnd !== null ? (
            <>
              <dt className="text-muted-foreground">
                {s.status === 'CANCEL_SCHEDULED' ? '끝나는 날' : '다음 결제일'}
              </dt>
              <dd className="m-0 flex items-center gap-1.5 tabular-nums">
                {formatJoinedOn(s.currentPeriodEnd)}
                {/* 결과를 모르는 갱신 결제가 됐을 때의 날짜다. 보여 주기만 하는 값(계약) */}
                {s.paymentPending ? <Badge tone="info">확정 전</Badge> : null}
              </dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {/* 연간만 값이 온다. 운영자가 포트원 콘솔에서 부분 취소할 금액(계약, 환불 정책 2절 3항) */}
      {user.refundAmount !== null ? (
        <p className="bg-muted m-0 rounded-md px-3 py-2 text-sm">
          오늘 환불하면 <b className="tabular-nums">{won(user.refundAmount)}원</b> (남은 기간의 90%)
        </p>
      ) : null}
    </section>
  )
}

function CopyPaymentId({ paymentId }: { paymentId: string }) {
  const { copied, copy } = useCopy(paymentId)
  const Icon = copied ? Check : Copy
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      shape="circle"
      aria-label={`결제 ID ${copied ? '복사됨' : '복사'}`}
      onClick={() => void copy()}
    >
      <Icon aria-hidden="true" />
    </Button>
  )
}

/** 결제 한 건. 취소·확인이 필요하면 빨간 테두리와 할 일을 적는다. 결과 모름이면 확정될 수 있어 확인부터 안내한다 */
function PaymentItem({ payment }: { payment: Payment }) {
  const status = PAYMENT_STATUS[payment.status]
  const pending = payment.status === 'PENDING'
  return (
    <li
      className={cn(
        'flex flex-col gap-2 rounded-md border p-4',
        payment.needsCancel ? 'border-destructive' : 'bg-muted/40 border-transparent',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <b className="tabular-nums">{won(payment.amount)}원</b>{' '}
          <span className="text-muted-foreground text-sm">
            {CYCLE_NAME[fromBillingCycle(payment.cycle)]}
          </span>
        </span>
        <span className="flex gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          {payment.needsCancel ? (
            <Badge tone="danger">{pending ? '확인 필요' : '취소 필요'}</Badge>
          ) : null}
        </span>
      </div>
      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-x-3 text-[13px] tabular-nums">
        <span>{formatPaidAt(payment.paidAt)}</span>
        <span className="flex min-w-0 items-center gap-1">
          <code className="break-all">{payment.paymentId}</code>
          <CopyPaymentId paymentId={payment.paymentId} />
        </span>
      </div>
      {payment.needsCancel ? (
        <p className="text-destructive-text m-0 text-[13px]">
          {pending
            ? '1시간 넘게 결과를 모르는 결제예요. 포트원 콘솔에서 상태를 확인해 주세요.'
            : '구독에 반영되지 않은 결제예요. 포트원 콘솔에서 취소해 주세요.'}
        </p>
      ) : null}
    </li>
  )
}

/** 결제 기록 (ADM-15). 최신순 전부가 온다(계약). 카드가 길어지지 않게 안에서 스크롤한다(푼 문제와 같다) */
export function PaymentHistory({ payments }: { payments: Payment[] }) {
  return (
    <section
      aria-labelledby="member-payments"
      className="bg-card flex flex-col gap-3 rounded-lg border p-6"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="member-payments" className="text-lg font-bold">
          결제 기록
        </h2>
        <span className="text-muted-foreground text-sm tabular-nums">{payments.length}건</span>
      </div>
      {payments.length === 0 ? (
        <p className="text-muted-foreground text-sm">결제 기록이 없어요.</p>
      ) : (
        // 스크롤 영역에 키보드가 닿도록 tabIndex를 준다
        <div
          tabIndex={0}
          role="region"
          aria-label="결제 기록 목록"
          className="max-h-[320px] overflow-y-auto"
        >
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {payments.map((payment) => (
              <PaymentItem key={payment.paymentId} payment={payment} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
