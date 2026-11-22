import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
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
    expect(card).toHaveTextContent('(다음 결제부터 연간 · 매년 99,000원)')
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
