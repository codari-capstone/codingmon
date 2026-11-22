import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Subscription } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import * as useAuthModule from '@/features/auth/useAuth'
import { freeSubscription } from '@/mocks/fixtures/subscriptions'
import { server } from '@/mocks/server'
import { Component as PricingPage } from './PricingPage'

afterEach(() => vi.restoreAllMocks())

function renderPricing({
  signedIn = false,
  loading = false,
  subscription = freeSubscription(1),
}: { signedIn?: boolean; loading?: boolean; subscription?: Subscription } = {}) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: null,
    isAuthenticated: signedIn,
    isLoading: loading,
  })
  // 로그인한 사용자의 프로 버튼은 구독을 보고 고른다(PRICE-03)
  server.use(http.get('*/api/users/me/subscription', () => HttpResponse.json(subscription)))
  const router = createMemoryRouter(
    [
      { path: '/pricing', Component: PricingPage },
      { path: '/login', element: <h1>로그인 화면</h1> },
    ],
    { initialEntries: ['/pricing'] },
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { router }
}

const card = (name: string) => screen.getByRole('article', { name })

describe('PricingPage (PRICE-01~03)', () => {
  it('처음은 월간이고, 연간으로 바꾸면 프로 가격과 문구만 바뀐다 (PRICE-02)', async () => {
    renderPricing()
    const monthly = screen.getByRole('button', { name: '월간 결제' })
    // 배지는 가격에서 계산한다: 8,250 × 12 = 99,000 = 9,900 × 10 → 2개월 무료(#333 리뷰)
    const yearly = screen.getByRole('button', { name: '연간 결제 2개월 무료' })
    expect(monthly).toHaveAttribute('aria-pressed', 'true')
    expect(yearly).toHaveAttribute('aria-pressed', 'false')
    expect(within(card('프로')).getByText('9,900')).toBeInTheDocument()
    expect(within(card('프로')).getByText('매달 자동 결제 · 언제든 해지')).toBeInTheDocument()

    await userEvent.click(yearly)

    expect(yearly).toHaveAttribute('aria-pressed', 'true')
    expect(monthly).toHaveAttribute('aria-pressed', 'false')
    expect(within(card('프로')).getByText('8,250')).toBeInTheDocument()
    expect(within(card('프로')).getByText('연 99,000원 한 번에 결제')).toBeInTheDocument()
    // 무료 카드는 그대로다
    expect(within(card('무료')).getByText('0')).toBeInTheDocument()
    expect(within(card('무료')).getByText('카드 등록 없이 바로 시작')).toBeInTheDocument()
  })

  it('비로그인: 무료는 가입, 프로는 이 화면으로 돌아오는 로그인 (PRICE-03)', async () => {
    const { router } = renderPricing()
    expect(within(card('무료')).getByRole('link', { name: '무료로 시작하기' })).toHaveAttribute(
      'href',
      '/signup',
    )

    await userEvent.click(within(card('프로')).getByRole('link', { name: '프로 시작하기' }))

    expect(await screen.findByRole('heading', { name: '로그인 화면' })).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ from: '/pricing' })
  })

  it('로그인한 무료 사용자: 무료는 문제 목록, 프로는 고른 주기로 결제 화면 (PRICE-03)', async () => {
    const user = userEvent.setup()
    renderPricing({ signedIn: true })
    expect(within(card('무료')).getByRole('link', { name: '문제 풀러 가기' })).toHaveAttribute(
      'href',
      '/problems',
    )
    const pro = await within(card('프로')).findByRole('link', { name: '프로 시작하기' })
    expect(pro).toHaveAttribute('href', '/checkout?cycle=monthly')
    expect(screen.queryByRole('link', { name: '문제 둘러보기' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /연간 결제/ }))
    expect(pro).toHaveAttribute('href', '/checkout?cycle=yearly')
  })

  it('결제에 실패한 사용자도 프로 시작하기다 (PRICE-03)', async () => {
    renderPricing({
      signedIn: true,
      subscription: { ...freeSubscription(1), status: 'PAYMENT_FAILED', cycle: 'MONTHLY' },
    })
    expect(
      await within(card('프로')).findByRole('link', { name: '프로 시작하기' }),
    ).toHaveAttribute('href', '/checkout?cycle=monthly')
  })

  it.each([
    ['프로를 쓰는 중', { plan: 'PRO', status: 'ACTIVE' }],
    ['해지 예정', { plan: 'PRO', status: 'CANCEL_SCHEDULED' }],
    ['첫 결제를 확인하는 중', { paymentPending: true }],
  ] as const)('%s이면 내 구독 보기 (PRICE-03)', async (_name, patch) => {
    renderPricing({ signedIn: true, subscription: { ...freeSubscription(1), ...patch } })
    expect(await within(card('프로')).findByRole('link', { name: '내 구독 보기' })).toHaveAttribute(
      'href',
      '/me/subscription',
    )
    expect(screen.queryByRole('link', { name: '프로 시작하기' })).not.toBeInTheDocument()
  })

  it('세션을 모르는 동안은 시작 버튼을 누를 수 없다', () => {
    renderPricing({ loading: true })
    expect(screen.queryByRole('link', { name: '무료로 시작하기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '프로 시작하기' })).not.toBeInTheDocument()
  })

  it('비교표는 포함·미포함을 말로 읽어 준다 (PRICE-01)', () => {
    renderPricing()
    const table = screen.getByRole('table')
    // 풀이 제안(리뷰)과 리포트는 무료도 쓴다(#333 리뷰, #321 댓글)
    for (const name of [/더 나은 풀이 제안/, /학습 리포트/]) {
      const row = within(table).getByRole('row', { name })
      expect(within(row).getAllByRole('img', { name: '포함' })).toHaveLength(2)
    }
    // 만들지 않기로 한 기능은 팔지 않는다(#248)
    expect(screen.queryByText(/오답 노트/)).not.toBeInTheDocument()
    expect(screen.queryByText(/7일/)).not.toBeInTheDocument()
  })
})
