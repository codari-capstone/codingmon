import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import * as useAuthModule from '@/features/auth/useAuth'
import { server } from '@/mocks/server'
import { Component as LandingPage } from './LandingPage'

afterEach(() => vi.restoreAllMocks())

function renderLanding({ signedIn = false, loading = false } = {}) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: null,
    isAuthenticated: signedIn,
    isLoading: loading,
  })
  const router = createMemoryRouter([{ path: '/', Component: LandingPage }], {
    initialEntries: ['/'],
  })
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('LandingPage (LAND-01~03)', () => {
  it('비로그인에게 가입 버튼과 로그인 링크를 보여 준다', () => {
    renderLanding()

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('틀린 이유까지')
    const starts = screen.getAllByRole('link', { name: '무료로 시작하기' })
    expect(starts).toHaveLength(2)
    starts.forEach((link) => expect(link).toHaveAttribute('href', '/signup'))
    expect(screen.getByRole('link', { name: '로그인' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: '문제 풀러 가기' })).not.toBeInTheDocument()
  })

  it('로그인한 사용자에게는 가입 대신 문제 목록 버튼을 보여 준다', () => {
    renderLanding({ signedIn: true })

    const starts = screen.getAllByRole('link', { name: '문제 풀러 가기' })
    expect(starts).toHaveLength(2)
    starts.forEach((link) => expect(link).toHaveAttribute('href', '/problems'))
    expect(screen.queryByRole('link', { name: '무료로 시작하기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
  })

  it('세션을 아직 모르면 가입·로그인으로 보내지 않는다', () => {
    renderLanding({ loading: true })

    expect(screen.queryByRole('link', { name: '무료로 시작하기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '문제 풀러 가기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '문제 둘러보기' })).not.toBeInTheDocument()
  })

  it('동작 방식 링크는 같은 화면의 동작 방식 구역으로 간다', () => {
    renderLanding()

    expect(screen.getByRole('link', { name: '어떻게 동작하나요?' })).toHaveAttribute('href', '#how')
    expect(document.getElementById('how')).toHaveTextContent('풀고, 틀리고, 이해하고, 다시 풀기')
  })

  it('문제 목록의 첫 4개를 번호·제목·난이도와 함께 문제로 잇는다', async () => {
    renderLanding()

    const section = await screen.findByRole('region', { name: '가볍게 하나 풀어 볼까요?' })
    const cards = within(section).getAllByRole('listitem')
    expect(cards).toHaveLength(4)
    const first = within(cards[0]).getByRole('link')
    expect(first.getAttribute('href')).toMatch(/^\/problems\/\d+$/)
    expect(first).toHaveTextContent(/#\d+/)
    expect(first).toHaveTextContent(/쉬움|보통|어려움/)
  })

  it('문제를 불러오지 못하면 미리보기 구역을 숨긴다', async () => {
    let calls = 0
    server.use(
      http.get('*/api/problems', () => {
        calls += 1
        return HttpResponse.json({}, { status: 500 })
      }),
    )
    renderLanding()

    // 앱 기본값이 한 번 더 묻는다(retry: 1). 두 번 다 실패한 뒤 확인한다. FAQ는 그대로 있다
    await waitFor(() => expect(calls).toBe(2), { timeout: 4000 })
    expect(
      screen.queryByRole('region', { name: '가볍게 하나 풀어 볼까요?' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '궁금한 게 있나요?' })).toBeInTheDocument()
  })

  it('자주 묻는 질문은 첫 질문이 열려 있고, 실제 앱과 같은 힌트 단계·언어를 적는다', async () => {
    renderLanding()

    // AI는 요청할 때만 돈다(AI_FEATURES 원칙 2). 버튼을 눌러야 본다고 적는다
    expect(screen.getByText(/\[AI 분석\]을 누르면 볼 수 있어요/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '힌트는 몇 단계까지 있나요?' }))
    expect(screen.getByText(/관찰 → 방향 → 원리 순서로 세 단계/)).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '어떤 언어로 풀 수 있나요?' }))
    expect(screen.getByText(/Python과 C\+\+/)).toBeVisible()
  })
})
