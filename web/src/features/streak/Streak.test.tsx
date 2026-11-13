import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { UserStreak } from '@/api/types'
import * as useAuthModule from '@/features/auth/useAuth'
import { streakFor } from '@/mocks/fixtures/activity'
import { server } from '@/mocks/server'
import { StreakCard } from './StreakCard'
import { StreakChip } from './StreakChip'

afterEach(() => vi.restoreAllMocks())

function signedIn(signed: boolean) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: signed
      ? { id: 1, email: 'us***@codari.test', nickname: '코다리', role: 'USER', githubLogin: null }
      : null,
    isAuthenticated: signed,
    isLoading: false,
  } as ReturnType<typeof useAuthModule.useAuth>)
}

function respond(streak: UserStreak) {
  server.use(http.get('*/api/users/me/streak', () => HttpResponse.json(streak)))
}

function renderIt(
  ui: React.ReactNode,
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
  return client
}

// 2026-11-13(금) 정오, 한국 시각. 이번 주 월요일은 11-09다
const NOW = Date.parse('2026-11-13T03:00:00Z')

describe('StreakCard (STREAK-01)', () => {
  it('어제까지 이어 왔으면 일수와 오늘 이을 방법, 이번 주 제출한 날을 보여 준다', async () => {
    signedIn(true)
    respond(streakFor(1, NOW))
    renderIt(<StreakCard />)

    const card = screen.getByRole('region', { name: '연속 학습' })
    expect(await within(card).findByText('오늘 한 문제만 풀면 4일이 돼요.')).toBeInTheDocument()
    expect(card).toHaveTextContent('3일째 이어 가는 중')
    const days = within(card)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    // 화·수·목 제출, 금요일이 오늘이고 아직 비었다
    expect(days).toEqual([
      '월 제출 안 함',
      '화 제출함',
      '수 제출함',
      '목 제출함',
      '오늘 제출 안 함',
      '토 제출 안 함',
      '일 제출 안 함',
    ])
  })

  it('오늘 제출했으면 이어 갔다고, 0일이면 시작하는 법을 알린다', async () => {
    signedIn(true)
    respond({ ...streakFor(1, NOW), currentStreak: 4, activeToday: true })
    renderIt(<StreakCard />)
    expect(await screen.findByText(/오늘도 이어 갔어요/)).toBeInTheDocument()
  })

  it('제출이 없으면 0일째에서 시작을 안내한다', async () => {
    signedIn(true)
    respond(streakFor(2, NOW))
    renderIt(<StreakCard />)
    expect(await screen.findByText('오늘 한 문제를 풀면 1일째가 시작돼요.')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: '연속 학습' })).not.toHaveTextContent('이어 가는 중')
  })

  it('비로그인은 API를 부르지 않고 0일째·빈 달력으로 그린다', () => {
    signedIn(false)
    const called = vi.fn()
    server.use(http.get('*/api/users/me/streak', called))
    renderIt(<StreakCard />)

    const card = screen.getByRole('region', { name: '연속 학습' })
    expect(card).toHaveTextContent('0일째')
    expect(card).toHaveTextContent('로그인하고 문제를 제출하면')
    // 오늘을 모르므로 '오늘' 칸이 없다
    expect(
      within(card)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['월', '화', '수', '목', '금', '토', '일'].map((d) => `${d} 제출 안 함`))
    expect(called).not.toHaveBeenCalled()
  })

  it('세션이 끊겨 비로그인이 되면 캐시에 남은 앞사람의 달력을 그리지 않는다', () => {
    signedIn(false)
    const client = new QueryClient()
    client.setQueryData(['streak'], { ...streakFor(1, NOW), activeToday: true })
    renderIt(<StreakCard />, client)

    const card = screen.getByRole('region', { name: '연속 학습' })
    expect(within(card).queryByText(/제출함/)).not.toBeInTheDocument()
    expect(within(card).queryByText('오늘')).not.toBeInTheDocument()
  })
})

describe('StreakChip (STREAK-02)', () => {
  it('연속 일수를 보여 주고 문제 목록으로 간다', async () => {
    signedIn(true)
    respond(streakFor(1, NOW))
    renderIt(<StreakChip />)
    const chip = await screen.findByRole('link', { name: '3일 연속 학습 중' })
    expect(chip).toHaveAttribute('href', '/problems')
  })

  it('비로그인은 0일로 보여 준다(명세)', () => {
    signedIn(false)
    renderIt(<StreakChip />)
    expect(screen.getByRole('link', { name: '0일 연속 학습 중' })).toBeInTheDocument()
  })

  it('로그인했는데 받지 못했으면 0일로 그리지 않고 칩을 두지 않는다', async () => {
    signedIn(true)
    server.use(http.get('*/api/users/me/streak', () => new HttpResponse(null, { status: 500 })))
    const client = renderIt(<StreakChip />)
    // 응답 전에도 링크는 없다. 실패가 확정된 뒤에 단언해야 '실패하면 0일' 회귀를 잡는다
    await waitFor(() => expect(client.getQueryState(['streak'])?.status).toBe('error'))
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
