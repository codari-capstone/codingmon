import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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

function renderPage(subscription: Subscription, state?: unknown) {
  server.use(http.get('*/api/users/me/subscription', () => HttpResponse.json(subscription)))
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

  it('결제 화면이 넘긴 안내를 보인다', async () => {
    renderPage(PRO, { notice: '이미 프로 구독 중이에요' })
    expect(await screen.findByText('이미 프로 구독 중이에요')).toBeInTheDocument()
  })
})
