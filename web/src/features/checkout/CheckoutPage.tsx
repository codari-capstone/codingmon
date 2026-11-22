import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'

import type { Subscription } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { LoadingState } from '@/components/LoadingState'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { CycleToggle } from '@/features/pricing/CycleToggle'
import {
  PLANS,
  proCharge,
  TEST_PAYMENT_NOTICE,
  won,
  YEARLY_FREE_MONTHS,
  type Cycle,
} from '@/features/pricing/plans'
import {
  addMonthsKst,
  formatLongDate,
  fromBillingCycle,
  startSubscription,
  SUBSCRIPTION_KEY,
  SUBSCRIPTION_PATH,
  subscriptionQuery,
} from '@/features/subscription/subscriptionQuery'
import { clearDraft, readDraft, saveDraft } from './checkoutDraft'
import { CheckoutResult } from './CheckoutResult'
import { classifyFailure, type CheckoutOutcome } from './outcome'
import { readBillingRedirect, requestBillingKey } from './portone'

const PRO = PLANS.find((p) => p.id === 'pro')!

const COPY = {
  monthly: {
    name: '프로 월간',
    per: '월',
    term: '1개월',
    every: '매월',
    sub: '매월 자동결제 · 언제든 해지',
  },
  yearly: {
    name: '프로 연간',
    per: '년',
    term: '1년',
    every: '매년',
    sub: `월 ${won(PRO.price.yearly)}원꼴${YEARLY_FREE_MONTHS > 0 ? ` · ${YEARLY_FREE_MONTHS}개월 무료` : ''}`,
  },
} as const

const NO_DRAFT = '카드 등록 정보를 이어받지 못했어요. 동의를 확인하고 다시 결제해 주세요.'
const NO_STORAGE =
  '이 브라우저에서는 결제 정보를 잠시 저장할 수 없어요. 사생활 보호 모드를 끄고 다시 시도해 주세요.'

/** 프로를 쓰는 중이거나 첫 결제를 확인하는 중이면 결제 화면이 아니라 마이페이지 구독이다 (PAY-01) */
const belongsToSubscription = (s: Subscription) => s.plan === 'PRO' || s.paymentPending

const cycleFrom = (raw: string | null): Cycle => (raw === 'yearly' ? 'yearly' : 'monthly')

/** 프로 구독 결제 (PAY-01) + 결제 결과 (PAY-02). 결과는 새 주소 없이 같은 화면에서 바꿔 그린다. */
export function Component() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const subscription = useQuery(subscriptionQuery())

  // 모바일 카드 등록에서 돌아왔으면 넘어가기 전에 저장한 값으로 시작한다. 첫 렌더에 한 번만 읽는다
  const [redirect] = useState(() => readBillingRedirect(params))
  const [draft] = useState(() => (redirect ? readDraft() : null))
  const resumeWith =
    redirect && 'billingKey' in redirect && draft?.agreeTerms && draft.agreeAutopay
      ? { billingKey: redirect.billingKey, cycle: draft.cycle }
      : null
  const [cycle, setCycle] = useState<Cycle>(draft?.cycle ?? cycleFrom(params.get('cycle')))
  const [agreeTerms, setAgreeTerms] = useState(draft?.agreeTerms ?? false)
  const [agreeAutopay, setAgreeAutopay] = useState(draft?.agreeAutopay ?? false)
  /** 카드 등록 창이 떠 있는 동안 */
  const [registering, setRegistering] = useState(false)
  /** 결과 모름 화면의 [다시 시도]로 같은 빌링키를 다시 보냈는지 */
  const resentAfterUnknown = useRef(false)

  // 모바일 카드 등록 페이지에서 뒤로 가면 브라우저가 떠나기 전 화면(등록 중)을 그대로 되살린다(bfcache).
  // 등록은 끝나지 않았으니 잠금을 풀어 다시 누를 수 있게 한다(#356 리뷰)
  useEffect(() => {
    const unlock = (event: PageTransitionEvent) => {
      if (event.persisted) setRegistering(false)
    }
    window.addEventListener('pageshow', unlock)
    return () => window.removeEventListener('pageshow', unlock)
  }, [])
  // 등록을 취소·실패하고 돌아왔으면 그 이유를, 동의를 이어받지 못했으면 다시 하라는 안내를 처음부터 띄운다
  const [notice, setNotice] = useState<string | null>(() =>
    !redirect || resumeWith ? null : 'code' in redirect ? redirect.message : NO_DRAFT,
  )
  const [outcome, setOutcome] = useState<CheckoutOutcome | null>(null)

  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, subscription.error)
  }, [queryClient, subscription.error])

  useEffect(() => {
    if (outcome) document.getElementById('checkout-result-title')?.focus()
  }, [outcome])

  const start = useMutation({
    mutationFn: startSubscription,
    onSuccess: (started, { cycle: asked }) => {
      // 남아 있던 결과 모름 결제가 확정되면 서버는 그 결제의 주기로 시작한다(계약 3단계). 그래서 응답의 주기를 보인다(#356 리뷰)
      const paid = started.cycle ? fromBillingCycle(started.cycle) : asked
      // 결과를 먼저 정한다. 캐시가 프로로 바뀌면 이 화면이 마이페이지로 보내기 때문이다(같은 렌더에 묶인다)
      setOutcome({ kind: 'success', subscription: started, cycle: paid })
      queryClient.setQueryData(SUBSCRIPTION_KEY, started)
    },
    onError: (error) => {
      let result = classifyFailure(error)
      if (result === 'signedOut') return forgetSessionIfUnauthorized(queryClient, error)
      // 결과 모름이나 실패는 서버의 결제 확인 중 여부를 바꾼다. 앞선 확인 중 상태가 캐시에 남으면
      // 실패 화면의 [다시 시도]가 결제 화면 대신 마이페이지로 밀려난다(#356 리뷰)
      void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY })
      if (result === 'already') {
        return navigate(SUBSCRIPTION_PATH, {
          replace: true,
          state: { notice: '이미 프로 구독 중이에요' },
        })
      }
      // 다른 탭의 결제가 결과 모름으로 남아 있으면 서버는 이번 빌링키를 지울 목록에 넣는다(계약 3단계).
      // 확인 중에서 다시 보낸 빌링키가 그래서 거절된 것이면 그 결제는 아직 끝나지 않았다(#356 리뷰)
      if (
        resentAfterUnknown.current &&
        (error as { code?: unknown } | null)?.code === 'BILLING_KEY_INVALID'
      ) {
        result = { kind: 'unknown' }
      }
      setOutcome(result)
    },
  })
  // 카드 등록에서 돌아와 바로 결제하면 effect가 결제를 보내기 전 첫 렌더부터 결제 중이다
  const paying = registering || start.isPending || (resumeWith !== null && start.isIdle)

  // 돌아온 주소의 빌링키는 읽자마자 지운다(브라우저 기록에 남지 않게). StrictMode의 두 번 실행에도 한 번만 결제한다
  const resumed = useRef(false)
  useEffect(() => {
    if (!redirect || resumed.current) return
    resumed.current = true
    clearDraft()
    setParams(draft ? { cycle: draft.cycle } : {}, { replace: true })
    // 동의를 이어받지 못했으면 결제하지 않는다(안내는 notice가 처음부터 띄운다)
    if (resumeWith) start.mutate(resumeWith)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 돌아온 순간 한 번만
  }, [])

  if (outcome) {
    return (
      <CheckoutResult
        outcome={outcome}
        onRetry={() => {
          setOutcome(null)
          setNotice(null)
          // 결제됐는지 모르거나 결제 전에 끊겼으면 같은 빌링키로 다시 보낸다. 서버가 남은 결제를 다시 조회해
          // 두 번 결제하지 않는다(계약 3단계). 결제 화면으로 돌리면 확인 중인 사용자는 마이페이지로 밀려나 다시 시도할 수 없다(#356 리뷰)
          resentAfterUnknown.current = outcome.kind === 'unknown'
          if (outcome.kind !== 'failed' && start.variables) start.mutate(start.variables)
        }}
      />
    )
  }
  if (subscription.isPending) return <LoadingState />
  if (subscription.error) {
    return <ErrorState problem={subscription.error} onRetry={() => void subscription.refetch()} />
  }
  if (!paying && belongsToSubscription(subscription.data)) {
    return <Navigate to={SUBSCRIPTION_PATH} replace />
  }

  const amount = won(proCharge(cycle))
  const copy = COPY[cycle]
  const ready = agreeTerms && agreeAutopay && !paying

  function changeCycle(next: Cycle) {
    if (next === cycle) return
    setCycle(next)
    // 금액이 바뀌었으니 자동결제 동의만 다시 받는다. 약관 동의는 그대로 둔다(PAY-01)
    setAgreeAutopay(false)
    setParams({ cycle: next }, { replace: true })
  }

  async function pay() {
    setNotice(null)
    resentAfterUnknown.current = false
    // 모바일은 카드 등록 페이지로 넘어갔다 돌아와 이 값으로 결제한다. 저장하지 못하면 돌아와도 결제할 수 없어
    // 같은 일을 되풀이하게 되므로 넘어가기 전에 멈춘다(#356 리뷰)
    if (!saveDraft({ cycle, agreeTerms, agreeAutopay })) return setNotice(NO_STORAGE)
    setRegistering(true)
    // 내 구독 조회는 늘 customerId를 준다(계약). 빈 값으로 카드를 등록하면 빌링키 주인 확인에서 막힌다
    const result = await requestBillingKey(subscription.data?.customerId ?? '')
    // 모바일은 카드 등록 페이지로 넘어간다. 돌아오면 위 effect가 이어서 결제한다
    if (result === undefined) return
    clearDraft()
    setRegistering(false)
    // 창을 닫았거나 등록이 실패했다. 결제 전이라 이 화면에 그대로 둔다
    if ('code' in result) return setNotice(result.message)
    start.mutate({ billingKey: result.billingKey, cycle })
  }

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 break-keep">
      <div className="flex flex-col gap-2">
        <Link
          to="/pricing"
          className="text-primary-text inline-flex w-fit items-center gap-1 rounded-[4px] text-sm font-semibold hover:underline"
        >
          <Icon name="chevron-left" size={16} />
          요금제로 돌아가기
        </Link>
        <h1 className="page-title">프로 구독 결제</h1>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section
          aria-labelledby="checkout-confirm"
          className="bg-card flex flex-col gap-6 rounded-[24px] border p-6 md:p-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="checkout-confirm" className="text-foreground m-0 text-lg font-bold">
              결제 전에 확인해 주세요
            </h2>
            <CycleToggle cycle={cycle} onChange={changeCycle} compact disabled={paying} />
          </div>

          <dl className="m-0 border-t text-[15px]">
            {(
              [
                ['플랜', <strong key="p">프로</strong>],
                [
                  '금액',
                  <span key="a">
                    <strong>{amount}원</strong> / {copy.per}{' '}
                    <span className="text-muted-foreground">(부가세 포함)</span>
                  </span>,
                ],
                ['이용 기간', `결제일부터 ${copy.term}`],
                ['결제 방식', `등록한 카드로 ${copy.every} 자동결제`],
                [
                  '다음 결제일',
                  formatLongDate(addMonthsKst(new Date(), cycle === 'monthly' ? 1 : 12)),
                ],
                [
                  '해지',
                  '마이페이지 › 구독에서 언제든 해지할 수 있어요. 해지해도 남은 기간은 프로로 써요.',
                ],
                [
                  '환불',
                  <span key="r">
                    결제 후 7일 안에 프로 기능을 쓰지 않았다면 전액 환불돼요. 프로 기능을 쓰면
                    청약철회가 제한돼요.{' '}
                    <a
                      href="/refund"
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary-text font-semibold hover:underline"
                    >
                      환불 정책 ↗<span className="sr-only">(새 탭)</span>
                    </a>
                  </span>,
                ],
              ] as const
            ).map(([term, detail]) => (
              <div key={term} className="grid grid-cols-[96px_1fr] gap-4 border-b py-3.5">
                <dt className="text-muted-foreground">{term}</dt>
                <dd className="text-foreground m-0 leading-[1.6]">{detail}</dd>
              </div>
            ))}
          </dl>

          <fieldset className="bg-muted m-0 flex flex-col rounded-[16px] border-0 px-5 py-2">
            <legend className="sr-only">결제 동의</legend>
            <Checkbox
              label="(필수) 이용약관과 환불 정책(청약철회 제한 포함)에 동의합니다"
              checked={agreeTerms}
              disabled={paying}
              onChange={(e) => setAgreeTerms(e.target.checked)}
            />
            <Checkbox
              label={`(필수) 해지할 때까지 ${copy.every} ${amount}원이 자동결제되는 것에 동의합니다`}
              checked={agreeAutopay}
              disabled={paying}
              onChange={(e) => setAgreeAutopay(e.target.checked)}
            />
          </fieldset>

          {notice ? <Alert tone="warning" title={notice} /> : null}

          <div className="flex flex-col items-center gap-3">
            <Button type="button" size="lg" fullWidth disabled={!ready} onClick={() => void pay()}>
              {paying ? '결제 중…' : `카드 등록하고 ${amount}원 결제하기`}
            </Button>
            <p className="text-muted-foreground m-0 inline-flex items-center gap-1.5 text-[13px]">
              <Icon name="lock" size={14} />
              {TEST_PAYMENT_NOTICE}
            </p>
          </div>
        </section>

        <aside aria-label="주문 요약" className="flex flex-col gap-3 lg:sticky lg:top-24">
          <div className="bg-card border-primary shadow-card flex flex-col gap-5 rounded-[24px] border-2 p-7">
            <div className="flex items-center gap-3">
              <span className="bg-accent text-primary-text inline-flex size-10 items-center justify-center rounded-xl">
                <Icon name={PRO.icon} size={20} />
              </span>
              <div className="flex flex-col">
                <strong className="text-foreground text-lg">{copy.name}</strong>
                <span className="text-muted-foreground text-[13px]">{copy.sub}</span>
              </div>
            </div>
            <p className="text-foreground m-0 flex items-baseline gap-1">
              <span className="text-[40px] leading-none font-bold tracking-[-0.03em] tabular-nums">
                {amount}
              </span>
              <span className="text-base font-semibold">원</span>
              <span className="text-muted-foreground text-base">/ {copy.per}</span>
            </p>
            <ul className="m-0 flex list-none flex-col gap-2.5 border-t p-0 pt-5">
              {PRO.features.map((f) => (
                <li key={f} className="text-body-foreground flex items-start gap-2.5 text-[15px]">
                  <Icon name="check" size={18} className="text-primary-text mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-muted-foreground m-0 px-2 text-[13px] leading-[1.6]">
            버튼을 누르면 카드 등록 창이 열리고, 등록하면 바로 결제돼요. 창을 닫으면 이 화면에
            그대로 남아요.
          </p>
        </aside>
      </div>
    </div>
  )
}
