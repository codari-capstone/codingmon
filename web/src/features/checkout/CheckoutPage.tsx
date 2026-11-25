import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'

import { ErrorState } from '@/components/ErrorState'
import { LoadingState } from '@/components/LoadingState'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { AI_QUOTA_QUERY_KEY } from '@/features/ai/analysisQuery'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { CycleToggle } from '@/features/pricing/CycleToggle'
import { PRO_PLAN, proCharge, won, YEARLY_FREE_MONTHS, type Cycle } from '@/features/pricing/plans'
import {
  addMonthsKst,
  belongsToSubscription,
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
    sub: `월 ${won(PRO_PLAN.price.yearly)}원꼴${YEARLY_FREE_MONTHS > 0 ? ` · ${YEARLY_FREE_MONTHS}개월 무료` : ''}`,
  },
} as const

const NO_DRAFT = '카드 등록 정보를 이어받지 못했어요. 동의를 확인하고 다시 결제해 주세요.'
const KEY_EXPIRED = '등록한 카드를 더 쓸 수 없어요. 카드를 다시 등록해 주세요.'
const NO_STORAGE =
  '이 브라우저에서는 결제 정보를 잠시 저장할 수 없어요. 사생활 보호 모드를 끄고 다시 시도해 주세요.'

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
  // 등록은 끝나지 않았으니 잠금을 풀어 다시 누를 수 있게 한다. 저장한 값도 지운다 — 남기면 앞으로 가기로
  // 그 등록을 마쳤을 때 화면에서 새로 고른 값이 아니라 옛 값으로 결제된다(#356 리뷰)
  useEffect(() => {
    const unlock = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      clearDraft()
      setRegistering(false)
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
    onSuccess: async (started, { cycle: asked }) => {
      // 남아 있던 결과 모름 결제가 확정되면 서버는 그 결제의 주기로 시작한다(계약 3단계). 그래서 응답의 주기를 보인다(#356 리뷰)
      const paid = started.cycle ? fromBillingCycle(started.cycle) : asked
      // 결과를 먼저 정한다. 캐시가 프로로 바뀌면 이 화면이 마이페이지로 보내기 때문이다
      setOutcome({ kind: 'success', subscription: started, cycle: paid })
      // 결제 전에 나간 구독 조회가 늦게 끝나 결제 전 값으로 덮지 않게 먼저 취소한다(#356 리뷰)
      await queryClient.cancelQueries({ queryKey: SUBSCRIPTION_KEY })
      queryClient.setQueryData(SUBSCRIPTION_KEY, started)
    },
    // 결과가 어떻든 요금제가 바뀌었을 수 있고, AI 한도는 요금제로 정해진다(#321). 무효화만 하면 결과 화면이
    // 다시 받는 동안(실패하면 계속) 옛 무료 한도와 요금제 안내를 그리므로 처음 상태로 되돌린다. 결과 화면이 떠 있으면(응답 전에 뒤로 감) 바로 다시 받는다(#369 리뷰)
    onSettled: () => queryClient.resetQueries({ queryKey: AI_QUOTA_QUERY_KEY }),
    onError: async (error) => {
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
      // 확인 중에서 다시 보낸 빌링키가 그래서 거절됐으면 서버에 확인 중인 결제가 남았는지 본다.
      // 남았으면 확인 중, 그 결제로 이미 프로가 됐으면 마이페이지, 끝났으면 이 빌링키는 더 못 쓰니
      // 새로 등록하게 실패로 보낸다(#356 리뷰)
      if (
        resentAfterUnknown.current &&
        (error as { code?: unknown } | null)?.code === 'BILLING_KEY_INVALID'
      ) {
        const now = await queryClient.fetchQuery(subscriptionQuery()).catch(() => null)
        if (now?.plan === 'PRO') return navigate(SUBSCRIPTION_PATH, { replace: true })
        result =
          !now || now.paymentPending ? { kind: 'unknown' } : { kind: 'failed', reason: KEY_EXPIRED }
      }
      setOutcome(result)
    },
  })
  // 카드 등록에서 돌아와 바로 결제하면 effect가 결제를 보내기 전 첫 렌더부터 결제 중이다
  const paying = registering || start.isPending || (resumeWith !== null && start.isIdle)

  // 돌아온 주소의 빌링키는 읽자마자 지운다(브라우저 기록에 남지 않게). StrictMode의 두 번 실행에도 한 번만 결제한다
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current) return
    resumed.current = true
    // 카드 등록에서 돌아온 게 아니면 남은 값은 지난 등록의 것이다. 뒤로 가기로 새로 불러온 뒤 앞으로 가기로
    // 그 등록을 마치면 옛 주기·동의로 결제된다(#356 리뷰). 돌아왔으면 위에서 이미 읽었다
    clearDraft()
    if (!redirect) return
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
  // 결제가 실패한 직후에는 구독을 다시 받는 중이고 캐시에 앞선 확인 중 값이 남아 있다. 새 값을 받은 뒤에 판단한다(#356 리뷰)
  if (!paying && !subscription.isFetching && belongsToSubscription(subscription.data)) {
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
          </div>
        </section>

        <aside aria-label="주문 요약" className="flex flex-col gap-3 lg:sticky lg:top-24">
          <div className="bg-card border-primary shadow-card flex flex-col gap-5 rounded-[24px] border-2 p-7">
            <div className="flex items-center gap-3">
              <span className="bg-accent text-primary-text inline-flex size-10 items-center justify-center rounded-xl">
                <Icon name={PRO_PLAN.icon} size={20} />
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
              {PRO_PLAN.features.map((f) => (
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
