import { QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Subscription } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { AI_QUOTA_QUERY_KEY, aiQuotaQuery, analysisQuery } from '@/features/ai/analysisQuery'
import { freeSubscription } from '@/mocks/fixtures/subscriptions'
import { server } from '@/mocks/server'
import { saveDraft } from './checkoutDraft'
import { Component as CheckoutPage } from './CheckoutPage'
import { requestBillingKey } from './portone'

vi.mock('./portone', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./portone')>()),
  requestBillingKey: vi.fn(),
}))

const ACTIVE: Subscription = {
  ...freeSubscription(1),
  plan: 'PRO',
  status: 'ACTIVE',
  cycle: 'MONTHLY',
  currentPeriodEnd: '2026-12-22T03:00:00Z',
}

/** 구독 조회는 `subscription`, 구독 시작은 `start`가 답한다. 보낸 본문은 `sent`에 쌓인다 */
function renderCheckout({
  url = '/checkout',
  subscription = freeSubscription(1),
  start = () => HttpResponse.json(ACTIVE, { status: 201 }),
}: {
  url?: string
  /** 매번 다른 값을 주려면 함수로 준다 */
  subscription?: Subscription | (() => Subscription | Promise<Subscription>)
  start?: () => Response
} = {}) {
  const sent: unknown[] = []
  server.use(
    http.get('*/api/users/me/subscription', async () =>
      HttpResponse.json(typeof subscription === 'function' ? await subscription() : subscription),
    ),
    http.post('*/api/users/me/subscription', async ({ request }) => {
      sent.push(await request.json())
      return start()
    }),
  )
  const router = createMemoryRouter(
    [
      { path: '/checkout', Component: CheckoutPage },
      { path: '/me/subscription', element: <h1>내 구독 화면</h1> },
    ],
    { initialEntries: [url] },
  )
  const client = createQueryClient()
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router, sent, client }
}

const payButton = () => screen.getByRole('button', { name: /결제하기|결제 중/ })

async function agreeAll(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('checkbox', { name: /이용약관과 환불 정책/ }))
  await user.click(screen.getByRole('checkbox', { name: /자동결제되는 것에 동의/ }))
}

beforeEach(() => sessionStorage.clear())
afterEach(() => vi.mocked(requestBillingKey).mockReset())

describe('CheckoutPage 결제 화면 (PAY-01)', () => {
  it('동의 두 칸을 모두 체크해야 결제 버튼이 켜진다', async () => {
    const user = userEvent.setup()
    renderCheckout()
    await user.click(await screen.findByRole('checkbox', { name: /이용약관과 환불 정책/ }))
    expect(payButton()).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /매월 9,900원이 자동결제/ }))
    expect(payButton()).toBeEnabled()
    expect(payButton()).toHaveAccessibleName('카드 등록하고 9,900원 결제하기')
  })

  it('요금제에서 고른 연간으로 시작하고, 주기를 바꾸면 자동결제 동의만 풀린다', async () => {
    const user = userEvent.setup()
    renderCheckout({ url: '/checkout?cycle=yearly' })
    await agreeAll(user)
    expect(payButton()).toHaveAccessibleName('카드 등록하고 99,000원 결제하기')

    await user.click(screen.getByRole('button', { name: '월간' }))

    expect(screen.getByRole('checkbox', { name: /이용약관과 환불 정책/ })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: /매월 9,900원이 자동결제/ })).not.toBeChecked()
    expect(payButton()).toBeDisabled()
  })

  it('프로를 쓰는 중이면 마이페이지 구독으로 보낸다', async () => {
    renderCheckout({ subscription: ACTIVE })
    expect(await screen.findByRole('heading', { name: '내 구독 화면' })).toBeInTheDocument()
  })

  it('첫 결제를 확인하는 중이어도 마이페이지 구독으로 보낸다', async () => {
    renderCheckout({ subscription: { ...freeSubscription(1), paymentPending: true } })
    expect(await screen.findByRole('heading', { name: '내 구독 화면' })).toBeInTheDocument()
  })

  it('카드 등록 창을 닫으면 결제하지 않고 이 화면에 남는다', async () => {
    vi.mocked(requestBillingKey).mockResolvedValue({
      code: 'FAILURE_TYPE_PG',
      message: '카드 등록을 취소했어요',
    })
    const user = userEvent.setup()
    const { sent } = renderCheckout()
    await agreeAll(user)
    await user.click(payButton())

    expect(await screen.findByText('카드 등록을 취소했어요')).toBeInTheDocument()
    expect(payButton()).toBeEnabled()
    expect(sent).toHaveLength(0)
  })

  // 모바일에서 돌아와도 결제할 수 없어 같은 일을 되풀이하게 된다. 넘어가기 전에 멈춘다(#356 리뷰)
  it('저장소가 막혀 있으면 카드 등록 창을 띄우지 않고 알린다', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    // 단언이 실패해도 되돌린다. 남으면 뒤 테스트의 저장이 모두 실패해 원인이 가려진다(#356 리뷰)
    try {
      const user = userEvent.setup()
      renderCheckout()
      await agreeAll(user)
      await user.click(payButton())

      expect(screen.getByText(/결제 정보를 잠시 저장할 수 없어요/)).toBeInTheDocument()
      expect(requestBillingKey).not.toHaveBeenCalled()
    } finally {
      setItem.mockRestore()
    }
  })

  // 등록 페이지에서 뒤로 가면 브라우저가 등록 중 화면을 그대로 되살린다(bfcache, #356 리뷰)
  it('카드 등록 중에 bfcache로 돌아오면 다시 누를 수 있다', async () => {
    // 모바일: 등록 페이지로 넘어가 promise가 끝나지 않는다
    vi.mocked(requestBillingKey).mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    renderCheckout()
    await agreeAll(user)
    await user.click(payButton())
    expect(payButton()).toHaveAccessibleName('결제 중…')
    expect(sessionStorage.length).toBe(1)

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }))

    expect(await screen.findByRole('button', { name: /결제하기/ })).toBeEnabled()
    // 앞으로 가기로 옛 등록을 마쳐도 옛 값으로 결제되지 않게 저장한 값을 지운다(#356 리뷰)
    expect(sessionStorage.length).toBe(0)
  })

  // bfcache를 쓰지 않는 브라우저는 뒤로 가기에서 화면을 새로 불러온다(#356 리뷰)
  it('카드 등록에서 돌아온 게 아니면 지난 등록의 저장 값을 지운다', async () => {
    saveDraft({ cycle: 'monthly', agreeTerms: true, agreeAutopay: true })
    renderCheckout({ url: '/checkout?cycle=yearly' })

    expect(await screen.findByRole('heading', { name: '프로 구독 결제' })).toBeInTheDocument()
    expect(sessionStorage.length).toBe(0)
  })

  it('고객 ID로 카드를 등록하고, 빌링키·주기·동의를 보낸다', async () => {
    vi.mocked(requestBillingKey).mockResolvedValue({ billingKey: 'billing-1' })
    const user = userEvent.setup()
    const { sent } = renderCheckout({ url: '/checkout?cycle=yearly' })
    await agreeAll(user)
    await user.click(payButton())

    expect(
      await screen.findByRole('heading', { name: '프로 구독이 시작됐어요' }),
    ).toBeInTheDocument()
    expect(requestBillingKey).toHaveBeenCalledWith('cus-mock-1')
    expect(sent).toEqual([{ billingKey: 'billing-1', cycle: 'YEARLY', agreed: true }])
  })
})

describe('CheckoutPage 결제 결과 (PAY-02)', () => {
  async function payWith(
    start: () => Response,
    subscription?: () => Subscription | Promise<Subscription>,
  ) {
    vi.mocked(requestBillingKey).mockResolvedValue({ billingKey: 'billing-1' })
    const user = userEvent.setup()
    const rendered = renderCheckout({ start, subscription })
    await agreeAll(user)
    await user.click(payButton())
    return { user, ...rendered }
  }

  it('결제가 끝나면 AI 한도 캐시를 지운다 (#369 리뷰)', async () => {
    // 한도는 요금제로 정해진다(#321). 무효화만 하면 결과 화면이 다시 받는 동안 옛 무료 한도를 그린다
    vi.mocked(requestBillingKey).mockResolvedValue({ billingKey: 'billing-1' })
    const user = userEvent.setup()
    const { client } = renderCheckout()
    client.setQueryData(AI_QUOTA_QUERY_KEY, {
      plan: 'FREE',
      limit: 3,
      used: 3,
      remaining: 0,
      resetsAt: '2026-11-08T00:00:00Z',
    })
    await agreeAll(user)
    expect(client.getQueryData(AI_QUOTA_QUERY_KEY)).toBeDefined()

    await user.click(payButton())

    await screen.findByRole('heading', { name: '프로 구독이 시작됐어요' })
    await waitFor(() => expect(client.getQueryData(AI_QUOTA_QUERY_KEY)).toBeUndefined())
  })

  it('결제가 끝나면 분석 캐시를 무효화해 힌트 단계를 다시 받게 한다 (#377 리뷰)', async () => {
    // 힌트 단계(maxHintLevel)도 요금제로 정해진다. 남으면 프로가 된 사용자에게 잠금 안내가 남는다
    vi.mocked(requestBillingKey).mockResolvedValue({ billingKey: 'billing-1' })
    const user = userEvent.setup()
    const { client } = renderCheckout()
    client.setQueryData(['analysis', 23], { revealedHintLevel: 1, maxHintLevel: 1 })
    await agreeAll(user)
    expect(client.getQueryState(['analysis', 23])?.isInvalidated).toBe(false)

    await user.click(payButton())

    await screen.findByRole('heading', { name: '프로 구독이 시작됐어요' })
    await waitFor(() => expect(client.getQueryState(['analysis', 23])?.isInvalidated).toBe(true))
  })

  it('결제 전에 나간 첫 분석 조회는 끊고 결제 뒤에 새로 받는다 (#377 리뷰)', async () => {
    // 결제 중에 뒤로 가 처음 연 결과 화면이다. 무효화만 하면 데이터 없는 첫 조회의 결제 전(무료) 응답을 그대로 쓴다
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    const levels: number[] = []
    server.use(
      http.get('*/api/submissions/:id/analysis', async () => {
        const first = levels.length === 0
        levels.push(first ? 1 : 3)
        if (first) await held
        return HttpResponse.json({
          submissionId: 23,
          status: 'COMPLETED',
          failureReason: null,
          blocked: false,
          maxHintLevel: first ? 1 : 3,
          summary: '요약',
          suspectLines: [],
          facts: [],
          guesses: [],
          revealedHintLevel: 1,
          hints: ['힌트 1'],
          createdAt: '2026-11-07T00:00:00Z',
          completedAt: '2026-11-07T00:00:05Z',
          quota: {
            plan: first ? 'FREE' : 'PRO',
            limit: 30,
            used: 0,
            remaining: 30,
            resetsAt: '2026-11-08T00:00:00Z',
          },
        })
      }),
    )
    vi.mocked(requestBillingKey).mockResolvedValue({ billingKey: 'billing-1' })
    const user = userEvent.setup()
    const { client } = renderCheckout()
    const unsubscribe = new QueryObserver(client, analysisQuery(23)).subscribe(() => {})
    await waitFor(() => expect(levels).toHaveLength(1))
    await agreeAll(user)

    await user.click(payButton())
    await screen.findByRole('heading', { name: '프로 구독이 시작됐어요' })
    release()

    await waitFor(() => expect(levels).toEqual([1, 3]))
    await waitFor(() =>
      expect(client.getQueryData<{ maxHintLevel: number }>(['analysis', 23])?.maxHintLevel).toBe(3),
    )
    unsubscribe()
  })

  it('결제가 끝날 때 한도를 보는 화면이 떠 있으면 바로 다시 받는다 (#369 리뷰)', async () => {
    // 결제 응답 전에 뒤로 가 결과 화면이 떠 있는 경우다. 지우기만 하면 그 화면은 옛 무료 한도를 붙잡고 있다
    const PRO = { plan: 'PRO', limit: 30, used: 0, remaining: 30, resetsAt: '2026-11-08T00:00:00Z' }
    server.use(http.get('*/api/users/me/ai-quota', () => HttpResponse.json(PRO)))
    vi.mocked(requestBillingKey).mockResolvedValue({ billingKey: 'billing-1' })
    const user = userEvent.setup()
    const { client } = renderCheckout()
    client.setQueryData(AI_QUOTA_QUERY_KEY, {
      ...PRO,
      plan: 'FREE',
      limit: 3,
      used: 3,
      remaining: 0,
    })
    const seen: unknown[] = []
    const unsubscribe = new QueryObserver(client, {
      ...aiQuotaQuery(),
      staleTime: Infinity,
    }).subscribe((result) => seen.push(result.data))
    await agreeAll(user)

    await user.click(payButton())

    await screen.findByRole('heading', { name: '프로 구독이 시작됐어요' })
    await waitFor(() => expect(seen.at(-1)).toEqual(PRO))
    unsubscribe()
  })

  it('성공: 플랜과 다음 결제일, 문제 풀러 가기·내 구독 보기', async () => {
    await payWith(() => HttpResponse.json(ACTIVE, { status: 201 }))
    expect(await screen.findByRole('heading', { name: '프로 구독이 시작됐어요' })).toHaveFocus()
    expect(screen.getByText('프로 월간 · 9,900원')).toBeInTheDocument()
    expect(screen.getByText('2026년 12월 22일')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문제 풀러 가기' })).toHaveAttribute(
      'href',
      '/problems',
    )
    expect(screen.getByRole('link', { name: '내 구독 보기' })).toHaveAttribute(
      'href',
      '/me/subscription',
    )
  })

  it('카드 결제 실패: 실패 이유를 보이고 다시 시도하면 결제 화면으로 돌아간다', async () => {
    const { user } = await payWith(() =>
      HttpResponse.json(
        { status: 402, code: 'PAYMENT_FAILED', detail: '카드 한도를 넘었어요' },
        { status: 402 },
      ),
    )
    expect(await screen.findByRole('heading', { name: '결제하지 못했어요' })).toBeInTheDocument()
    expect(screen.getByText(/카드 한도를 넘었어요/)).toHaveTextContent(
      '실패 이유 · 카드 한도를 넘었어요',
    )

    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(screen.getByRole('heading', { name: '프로 구독 결제' })).toBeInTheDocument()
  })

  it('결제 전 연결 실패: 결제되지 않았다고 알린다', async () => {
    await payWith(() =>
      HttpResponse.json({ status: 503, code: 'PAYMENT_PROVIDER_UNAVAILABLE' }, { status: 503 }),
    )
    expect(
      await screen.findByRole('heading', { name: '결제 서비스에 잠시 연결할 수 없어요' }),
    ).toBeInTheDocument()
    expect(screen.getByText(/이번 요청은 결제되지 않았어요/)).toBeInTheDocument()
  })

  it.each([
    [
      '결과 모름(503)',
      () => HttpResponse.json({ status: 503, code: 'PAYMENT_UNAVAILABLE' }, { status: 503 }),
    ],
    ['응답을 못 받음', () => HttpResponse.error()],
  ])('%s: 확인 중이고 내 구독 보기를 준다', async (_name, start) => {
    await payWith(start)
    expect(
      await screen.findByRole('heading', { name: '결제 결과를 확인하고 있어요' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '내 구독 보기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  // 결제한 뒤 반영하다 난 오류일 수 있어 결제되지 않았다고 말하지 않는다(#356 리뷰)
  it('서버 오류(500)도 확인 중이다', async () => {
    await payWith(() => HttpResponse.json({ status: 500 }, { status: 500 }))
    expect(
      await screen.findByRole('heading', { name: '결제 결과를 확인하고 있어요' }),
    ).toBeInTheDocument()
  })

  // 결제 화면으로 돌리면 확인 중인 사용자는 마이페이지로 밀려나 다시 시도할 수 없다(#356 리뷰)
  it('확인 중에 다시 시도하면 같은 빌링키로 다시 보낸다', async () => {
    let calls = 0
    const { user, sent } = await payWith(() =>
      ++calls === 1
        ? HttpResponse.json({ status: 503, code: 'PAYMENT_UNAVAILABLE' }, { status: 503 })
        : HttpResponse.json(ACTIVE, { status: 201 }),
    )
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(
      await screen.findByRole('heading', { name: '프로 구독이 시작됐어요' }),
    ).toBeInTheDocument()
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual(sent[0])
    expect(requestBillingKey).toHaveBeenCalledTimes(1)
  })

  // 다른 탭의 결제가 결과 모름이면 서버는 이번 빌링키를 지운다. 그 결제는 아직 끝나지 않았다(#356 리뷰)
  it('확인 중에 다시 보낸 빌링키가 거절되고 확인 중 결제가 남았으면 확인 중을 유지한다', async () => {
    let calls = 0
    const { user } = await payWith(
      () =>
        ++calls === 1
          ? HttpResponse.json({ status: 503, code: 'PAYMENT_UNAVAILABLE' }, { status: 503 })
          : HttpResponse.json({ status: 400, code: 'BILLING_KEY_INVALID' }, { status: 400 }),
      () => ({ ...freeSubscription(1), paymentPending: calls > 0 }),
    )
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    await waitFor(() => expect(calls).toBe(2))
    expect(
      await screen.findByRole('heading', { name: '결제 결과를 확인하고 있어요' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '결제하지 못했어요' })).not.toBeInTheDocument()
  })

  // 남은 결제가 끝났는데 확인 중으로 두면 몇 번을 눌러도 같은 화면이 되풀이된다(#356 리뷰)
  it('다시 보낸 빌링키가 거절되고 확인 중 결제가 끝났으면 카드를 다시 등록하게 한다', async () => {
    let calls = 0
    const { user } = await payWith(
      () =>
        ++calls === 1
          ? HttpResponse.json({ status: 503, code: 'PAYMENT_UNAVAILABLE' }, { status: 503 })
          : HttpResponse.json({ status: 400, code: 'BILLING_KEY_INVALID' }, { status: 400 }),
      // 첫 결제 뒤에는 확인 중, 다시 보낼 때는 이미 실패로 닫혀 확인 중이 아니다
      () => ({ ...freeSubscription(1), paymentPending: calls === 1 }),
    )
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(await screen.findByRole('heading', { name: '결제하지 못했어요' })).toBeInTheDocument()
    expect(screen.getByText(/카드를 다시 등록해 주세요/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('heading', { name: '프로 구독 결제' })).toBeInTheDocument()
  })

  // 다른 탭의 결과 모름 결제가 그 사이 성공으로 확정됐으면 구독은 이미 시작됐다(#356 리뷰)
  it('다시 보낸 빌링키가 거절됐는데 그 사이 프로가 됐으면 마이페이지 구독으로 보낸다', async () => {
    let calls = 0
    const { user } = await payWith(
      () =>
        ++calls === 1
          ? HttpResponse.json({ status: 503, code: 'PAYMENT_UNAVAILABLE' }, { status: 503 })
          : HttpResponse.json({ status: 400, code: 'BILLING_KEY_INVALID' }, { status: 400 }),
      () =>
        calls === 1
          ? { ...freeSubscription(1), paymentPending: true }
          : calls > 1
            ? ACTIVE
            : freeSubscription(1),
    )
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))

    expect(await screen.findByRole('heading', { name: '내 구독 화면' })).toBeInTheDocument()
  })

  // 실패 뒤 구독을 다시 받는 동안 캐시에는 앞선 확인 중 값이 남아 있다(#356 리뷰)
  it('실패 뒤 구독을 다시 받기 전에 다시 시도해도 결제 화면에 남는다', async () => {
    let calls = 0
    // 실패(두 번째 결제) 뒤의 다시 받기를 풀어 줄 때까지 붙잡아 둔다
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const { user, router } = await payWith(
      () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ status: 503, code: 'PAYMENT_UNAVAILABLE' }, { status: 503 })
          : HttpResponse.json({ status: 402, code: 'PAYMENT_FAILED' }, { status: 402 })
      },
      async () => {
        if (calls >= 2) await held
        return { ...freeSubscription(1), paymentPending: calls === 1 }
      },
    )
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('heading', { name: '결제하지 못했어요' })).toBeInTheDocument()

    // 캐시에는 아직 첫 결제 뒤의 확인 중 값이 있다
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('heading', { name: '프로 구독 결제' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/checkout')

    release()
    expect(await screen.findByRole('heading', { name: '프로 구독 결제' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/checkout')
  })

  // 앞선 확인 중 상태가 캐시에 남으면 실패의 [다시 시도]가 마이페이지로 밀려난다(#356 리뷰)
  it('확인 중 뒤 실패로 끝나면 다시 시도로 결제 화면에 돌아온다', async () => {
    // 서버는 첫 결제가 결과 모름인 동안 확인 중이고, 다시 보낸 결제가 실패로 닫으면 확인 중이 풀린다
    let calls = 0
    const { user } = await payWith(
      () => {
        calls += 1
        return calls === 1
          ? HttpResponse.json({ status: 503, code: 'PAYMENT_UNAVAILABLE' }, { status: 503 })
          : HttpResponse.json(
              { status: 402, code: 'PAYMENT_FAILED', detail: '한도 초과' },
              { status: 402 },
            )
      },
      () => ({ ...freeSubscription(1), paymentPending: calls === 1 }),
    )
    await user.click(await screen.findByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('heading', { name: '결제하지 못했어요' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(await screen.findByRole('heading', { name: '프로 구독 결제' })).toBeInTheDocument()
  })

  // 남아 있던 결과 모름 결제가 확정되면 서버는 그 결제의 주기로 시작한다(계약 3단계, #356 리뷰)
  it('성공 화면의 플랜은 서버가 확정한 주기다', async () => {
    await payWith(() => HttpResponse.json({ ...ACTIVE, cycle: 'YEARLY' }, { status: 201 }))
    expect(await screen.findByText('프로 연간 · 99,000원')).toBeInTheDocument()
  })

  it('이미 프로(409): 마이페이지 구독으로 보내며 알린다', async () => {
    const { router } = await payWith(() =>
      HttpResponse.json({ status: 409, code: 'SUBSCRIPTION_ALREADY_ACTIVE' }, { status: 409 }),
    )
    expect(await screen.findByRole('heading', { name: '내 구독 화면' })).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ notice: '이미 프로 구독 중이에요' })
  })
})

describe('CheckoutPage 모바일 카드 등록에서 돌아옴 (PAY-01)', () => {
  it('저장한 주기·동의로 바로 결제하고, 주소에서 빌링키를 지운다', async () => {
    saveDraft({ cycle: 'yearly', agreeTerms: true, agreeAutopay: true })
    const { router, sent } = renderCheckout({
      url: '/checkout?result=billing&billingKey=billing-m',
    })

    expect(
      await screen.findByRole('heading', { name: '프로 구독이 시작됐어요' }),
    ).toBeInTheDocument()
    expect(sent).toEqual([{ billingKey: 'billing-m', cycle: 'YEARLY', agreed: true }])
    expect(router.state.location.search).toBe('?cycle=yearly')
    expect(sessionStorage.length).toBe(0)
  })

  it('등록을 취소하고 돌아오면 저장한 값으로 화면을 다시 채운다', async () => {
    saveDraft({ cycle: 'yearly', agreeTerms: true, agreeAutopay: false })
    const { sent } = renderCheckout({
      url: '/checkout?result=billing&code=FAILURE_TYPE_PG&message=여기로 연락하세요',
    })

    expect(await screen.findByText(/카드를 등록하지 못했어요/)).toBeInTheDocument()
    expect(screen.queryByText('여기로 연락하세요')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /연간/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('checkbox', { name: /이용약관과 환불 정책/ })).toBeChecked()
    expect(sent).toHaveLength(0)
  })

  it('저장한 동의를 찾지 못하면 결제하지 않는다', async () => {
    const { sent } = renderCheckout({ url: '/checkout?result=billing&billingKey=billing-m' })

    expect(await screen.findByText(/카드 등록 정보를 이어받지 못했어요/)).toBeInTheDocument()
    await waitFor(() => expect(payButton()).toBeDisabled())
    expect(sent).toHaveLength(0)
  })
})
