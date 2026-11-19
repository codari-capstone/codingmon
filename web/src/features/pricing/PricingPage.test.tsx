import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as useAuthModule from '@/features/auth/useAuth'
import { Component as PricingPage } from './PricingPage'

afterEach(() => vi.restoreAllMocks())

function renderPricing({ signedIn = false, loading = false } = {}) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: null,
    isAuthenticated: signedIn,
    isLoading: loading,
  })
  const router = createMemoryRouter(
    [
      { path: '/pricing', Component: PricingPage },
      { path: '/login', element: <h1>로그인 화면</h1> },
    ],
    { initialEntries: ['/pricing'] },
  )
  render(<RouterProvider router={router} />)
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

  it('로그인한 사용자: 무료는 문제 목록, 프로는 누를 수 없는 결제 준비 중 (PRICE-03)', () => {
    renderPricing({ signedIn: true })
    expect(within(card('무료')).getByRole('link', { name: '문제 풀러 가기' })).toHaveAttribute(
      'href',
      '/problems',
    )
    expect(within(card('프로')).getByRole('button', { name: '결제 준비 중' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: '프로 시작하기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '문제 둘러보기' })).not.toBeInTheDocument()
  })

  it('세션을 모르는 동안은 시작 버튼을 누를 수 없다', () => {
    renderPricing({ loading: true })
    expect(screen.queryByRole('link', { name: '무료로 시작하기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '프로 시작하기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '결제 준비 중' })).not.toBeInTheDocument()
  })

  it('비교표는 포함·미포함을 말로 읽어 주고, 테스트 결제임을 알린다 (PRICE-01)', () => {
    renderPricing()
    const table = screen.getByRole('table')
    const row = within(table).getByRole('row', { name: /더 나은 풀이 제안/ })
    expect(within(row).getByRole('img', { name: '미포함' })).toBeInTheDocument()
    expect(within(row).getByRole('img', { name: '포함' })).toBeInTheDocument()
    // 리포트는 무료도 쓴다(#321 댓글)
    const report = within(table).getByRole('row', { name: /학습 리포트/ })
    expect(within(report).getAllByRole('img', { name: '포함' })).toHaveLength(2)
    expect(screen.getAllByText(/실제로 돈이 나가지 않아요/).length).toBeGreaterThan(0)
    expect(screen.queryByText(/7일/)).not.toBeInTheDocument()
  })
})
