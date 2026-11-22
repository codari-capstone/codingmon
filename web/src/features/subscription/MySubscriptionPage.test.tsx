import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { CurrentUser, Subscription } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { freeSubscription } from '@/mocks/fixtures/subscriptions'
import { server } from '@/mocks/server'
import { Component as MySubscriptionPage } from './MySubscriptionPage'

const USER: CurrentUser = {
  id: 1,
  nickname: '코다리',
  role: 'USER',
  avatarUrl: null,
  email: 'us***@codari.test',
  loginMethod: 'EMAIL',
  githubUsername: null,
  welcomeSeen: true,
}

const PRO: Subscription = {
  ...freeSubscription(1),
  plan: 'PRO',
  status: 'ACTIVE',
  cycle: 'MONTHLY',
  currentPeriodEnd: '2026-12-22T03:00:00Z',
}

function renderPage(subscription: Subscription | (() => Subscription), state?: unknown) {
  server.use(
    http.get('*/api/users/me/subscription', () =>
      HttpResponse.json(typeof subscription === 'function' ? subscription() : subscription),
    ),
  )
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, USER)
  const router = createMemoryRouter([{ path: '/me/subscription', Component: MySubscriptionPage }], {
    initialEntries: [{ pathname: '/me/subscription', state }],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

const plan = () => screen.findByRole('region', { name: '지금 플랜' })

describe('MySubscriptionPage 구독 (MY-06)', () => {
  it('무료: 무료 플랜과 프로 시작하기(요금제)', async () => {
    renderPage(freeSubscription(1))
    expect(await plan()).toHaveTextContent('무료 플랜무료')
    expect(screen.getByRole('link', { name: '프로 시작하기' })).toHaveAttribute('href', '/pricing')
  })

  it('첫 결제 확인 중: 안내만 두고 결제 버튼을 숨긴다', async () => {
    renderPage({ ...freeSubscription(1), paymentPending: true })
    expect(await plan()).toHaveTextContent('결제 확인 중')
    expect(screen.getByText('결제 결과를 확인하고 있어요')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: /프로 시작하기|카드 다시 등록/ }),
    ).not.toBeInTheDocument()
  })

  it('진행 중: 프로 월간과 다음 결제일', async () => {
    renderPage(PRO)
    const card = await plan()
    expect(card).toHaveTextContent('프로 월간진행 중')
    expect(card).toHaveTextContent('다음 결제일 12월 22일 · 9,900원')
    expect(card).toHaveTextContent('2026년 12월 22일')
  })

  it('해지 예정: 끝나는 날까지 프로', async () => {
    renderPage({ ...PRO, status: 'CANCEL_SCHEDULED' })
    const card = await plan()
    expect(card).toHaveTextContent('해지 예정')
    expect(card).toHaveTextContent('12월 22일까지 프로')
    expect(card).toHaveTextContent('프로 끝나는 날')
  })

  it('결제 실패: 알리고 실패한 주기로 카드 다시 등록', async () => {
    renderPage({
      ...freeSubscription(1),
      status: 'PAYMENT_FAILED',
      cycle: 'YEARLY',
    })
    expect(await plan()).toHaveTextContent('결제 실패')
    expect(screen.getByText('결제에 실패해 무료로 바뀌었어요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '카드 다시 등록' })).toHaveAttribute(
      'href',
      '/checkout?cycle=yearly',
    )
  })

  // 기록에 남기면 새로 고침·뒤로 가기 때마다 다시 뜬다(#356 리뷰)
  it('결제 화면이 넘긴 안내를 보이고 기록에서는 지운다', async () => {
    const router = renderPage(PRO, { notice: '이미 프로 구독 중이에요' })
    expect(await screen.findByText('이미 프로 구독 중이에요')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.state).toBeNull())
    expect(screen.getByText('이미 프로 구독 중이에요')).toBeInTheDocument()
  })

  // 다음 결제는 바꾼 주기의 금액이다(계약 `nextCycle`, #356 리뷰)
  it('주기를 바꿨으면 다음 결제 금액은 바꾼 주기다', async () => {
    renderPage({ ...PRO, nextCycle: 'YEARLY' })
    const card = await plan()
    expect(card).toHaveTextContent('프로 월간')
    expect(card).toHaveTextContent('다음 결제일 12월 22일 · 99,000원')
    expect(card).toHaveTextContent('다음 결제부터 연간 · 12월 22일부터 연 99,000원이 자동결제돼요.')
    // 바꾼 뒤에는 띠의 [바꾸기 취소]만 있다(디자인)
    expect(within(card).queryByRole('button', { name: '연간으로 바꾸기' })).not.toBeInTheDocument()
    expect(within(card).getByRole('button', { name: '해지' })).toBeInTheDocument()
  })

  // 결제가 확정돼도 화면을 연 채로는 새로 받지 않는다(#356 리뷰)
  it('결제 확인 중이면 다시 확인으로 새 상태를 받는다', async () => {
    let current: Subscription = { ...freeSubscription(1), paymentPending: true }
    renderPage(() => current)
    expect(await plan()).toHaveTextContent('결제 확인 중')

    current = PRO
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 확인' }))

    expect(await screen.findByText('프로에서 쓰고 있는 것')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 확인' })).not.toBeInTheDocument()
  })
})

/** 구독 관리 요청을 `answer`로 답하고 보낸 경로·본문을 쌓는다 */
function answerActions(answer: (path: string, body: unknown) => Response) {
  const sent: { path: string; body: unknown }[] = []
  const handle = async ({ request }: { request: Request }) => {
    const path = new URL(request.url).pathname.replace('/api/users/me/subscription/', '')
    const body = request.method === 'PUT' ? await request.json() : null
    sent.push({ path, body })
    return answer(path, body)
  }
  server.use(
    http.post('*/api/users/me/subscription/cancel', handle),
    http.post('*/api/users/me/subscription/resume', handle),
    http.put('*/api/users/me/subscription/cycle', handle),
  )
  return sent
}

describe('MySubscriptionPage 구독 관리 (MY-06)', () => {
  it('진행 중: 해지 확인 창을 거쳐 해지하면 해지 예정이 되고 포커스는 플랜 이름으로 간다', async () => {
    const user = userEvent.setup()
    const sent = answerActions(() => HttpResponse.json({ ...PRO, status: 'CANCEL_SCHEDULED' }))
    renderPage(PRO)
    await user.click(within(await plan()).getByRole('button', { name: '해지' }))

    const dialog = screen.getByRole('alertdialog', { name: '프로 구독을 해지할까요?' })
    expect(dialog).toHaveTextContent(
      '12월 22일까지 프로로 쓸 수 있어요. 그 뒤에는 무료로 바뀌고 더 결제되지 않아요.',
    )
    await user.click(within(dialog).getByRole('button', { name: '해지' }))

    expect(await screen.findByRole('button', { name: '해지 취소' })).toBeInTheDocument()
    expect(await plan()).toHaveTextContent('해지 예정')
    expect(screen.getByRole('status')).toHaveTextContent('해지했어요.')
    expect(sent).toEqual([{ path: 'cancel', body: null }])
    await waitFor(() => expect(screen.getByRole('heading', { name: '프로 월간' })).toHaveFocus())
  })

  it('[계속 쓸게요]는 해지하지 않는다', async () => {
    const user = userEvent.setup()
    const sent = answerActions(() => HttpResponse.json(PRO))
    renderPage(PRO)
    await user.click(within(await plan()).getByRole('button', { name: '해지' }))
    await user.click(screen.getByRole('button', { name: '계속 쓸게요' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(sent).toEqual([])
  })

  // 갱신 결제가 실패로 확정되면 기간 끝을 기다리지 않고 무료가 된다(계약 cancel)
  it('갱신 결제 확인 중이면 해지 창이 결제되지 않았을 때를 알린다', async () => {
    const user = userEvent.setup()
    renderPage({ ...PRO, paymentPending: true })
    await user.click(within(await plan()).getByRole('button', { name: '해지' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '갱신 결제를 확인하고 있어요. 결제되면 12월 22일까지 프로로 쓸 수 있고, 결제되지 않으면 바로 무료로 바뀌어요.',
    )
  })

  it('주기를 바꿔 뒀으면 해지 창이 바꾸기도 취소된다고 알린다', async () => {
    const user = userEvent.setup()
    renderPage({ ...PRO, nextCycle: 'YEARLY' })
    await user.click(within(await plan()).getByRole('button', { name: '해지' }))

    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '해지하면 주기 바꾸기도 함께 취소돼요.',
    )
  })

  it('해지 예정: 해지 취소로 진행 중에 돌아간다', async () => {
    const user = userEvent.setup()
    const sent = answerActions(() => HttpResponse.json(PRO))
    renderPage({ ...PRO, status: 'CANCEL_SCHEDULED' })
    await user.click(await screen.findByRole('button', { name: '해지 취소' }))

    expect(await plan()).toHaveTextContent('진행 중')
    expect(screen.getByRole('status')).toHaveTextContent('해지를 취소했어요.')
    expect(sent).toEqual([{ path: 'resume', body: null }])
  })

  it('주기 바꾸기: 동의해야 켜지고, 바꾸면 다음 결제부터 연간 띠가 생긴다', async () => {
    const user = userEvent.setup()
    const sent = answerActions(() => HttpResponse.json({ ...PRO, nextCycle: 'YEARLY' }))
    renderPage(PRO)
    await user.click(within(await plan()).getByRole('button', { name: '연간으로 바꾸기' }))

    const dialog = screen.getByRole('dialog', { name: '연간으로 바꿀까요?' })
    expect(dialog).toHaveTextContent(
      '지금 기간(12월 22일까지)은 그대로예요. 12월 22일부터 연간 99,000원이 자동결제돼요.',
    )
    const confirm = within(dialog).getByRole('button', { name: '연간으로 바꾸기' })
    expect(confirm).toBeDisabled()
    await user.click(within(dialog).getByRole('checkbox', { name: /바뀐 금액의 자동결제에 동의/ }))
    await user.click(confirm)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await plan()).toHaveTextContent('다음 결제부터 연간')
    expect(screen.getByRole('status')).toHaveTextContent('다음 결제부터 연간으로 바꿨어요.')
    expect(sent).toEqual([{ path: 'cycle', body: { cycle: 'YEARLY', agreed: true } }])
  })

  it('연간 구독은 월간으로 바꾸기다', async () => {
    renderPage({ ...PRO, cycle: 'YEARLY' })
    expect(
      within(await plan()).getByRole('button', { name: '월간으로 바꾸기' }),
    ).toBeInTheDocument()
  })

  // 지금 주기를 보내면 바꾸기 취소다. 동의는 필요 없다(계약 cycle)
  it('바꾸기 취소는 지금 주기를 보내고 띠를 없앤다', async () => {
    const user = userEvent.setup()
    const sent = answerActions(() => HttpResponse.json(PRO))
    renderPage({ ...PRO, nextCycle: 'YEARLY' })
    await user.click(await screen.findByRole('button', { name: '바꾸기 취소' }))

    expect(
      await within(await plan()).findByRole('button', { name: '연간으로 바꾸기' }),
    ).toBeInTheDocument()
    expect(screen.queryByText(/다음 결제부터 연간/)).not.toBeInTheDocument()
    expect(sent).toEqual([{ path: 'cycle', body: { cycle: 'MONTHLY', agreed: false } }])
  })

  // 다른 탭에서 해지했거나 기간이 끝났다. 낡은 화면을 새로 받는다
  it('409 SUBSCRIPTION_NOT_ACTIVE면 알리고 구독을 새로 받는다', async () => {
    const user = userEvent.setup()
    let current: Subscription = { ...PRO, status: 'CANCEL_SCHEDULED' }
    answerActions(() =>
      HttpResponse.json(
        { status: 409, code: 'SUBSCRIPTION_NOT_ACTIVE', detail: '진행 중인 프로 구독이 없어요.' },
        { status: 409 },
      ),
    )
    renderPage(() => current)
    const resume = await screen.findByRole('button', { name: '해지 취소' })
    current = freeSubscription(1)
    await user.click(resume)

    expect(await screen.findByRole('alert')).toHaveTextContent('진행 중인 프로 구독이 없어요.')
    expect(await plan()).toHaveTextContent('무료 플랜')
  })
})
