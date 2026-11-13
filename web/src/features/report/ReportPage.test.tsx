import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { learningStatsReady, learningStatsShort } from '@/mocks/fixtures/learning'
import { server } from '@/mocks/server'
import { Component as ReportPage } from './ReportPage'

function renderReport() {
  const router = createMemoryRouter(
    [
      { path: '/me/report', Component: ReportPage },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
    ],
    { initialEntries: ['/me/report'] },
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('ReportPage (REP-01·02)', () => {
  it('맞힌 문제가 모자라면 더 맞혀야 할 개수와 문제 목록 길을 알려 준다', async () => {
    server.use(
      http.get('*/api/users/me/learning-stats', () => HttpResponse.json(learningStatsShort)),
    )
    renderReport()

    expect(await screen.findByText('3문제 더 맞히면 리포트를 볼 수 있어요')).toBeInTheDocument()
    expect(screen.getByText(/지금 2문제를 맞혔어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문제 보러 가기' })).toHaveAttribute(
      'href',
      '/problems',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // 통계가 없어도 화면 제목은 있다
    expect(screen.getByRole('heading', { level: 1, name: '학습 리포트' })).toBeInTheDocument()
  })

  it('개념별 통계를 서버 순서와 값 그대로 보여 주고, 해결률만 백분율로 적는다', async () => {
    renderReport()

    await screen.findByRole('table')
    const rows = screen.getAllByRole('row').slice(1)
    // 서버가 정한 취약 점수 높은 순을 다시 정렬하지 않는다
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      '동적 계획법취약',
      '그래프취약',
      '문자열',
      '수학',
    ])

    const dp = within(rows[0]).getAllByRole('cell')
    expect(dp[1]).toHaveTextContent('25%1 / 4')
    expect(dp[2]).toHaveTextContent('2.5')
    expect(dp[3]).toHaveTextContent('4.5')
    expect(dp[4]).toHaveTextContent('0.8')

    // 서버가 둘째 자리까지 반올림한 값(0.33)을 다시 계산하지 않고 33%로 옮긴다
    expect(within(rows[1]).getAllByRole('cell')[1]).toHaveTextContent('33%1 / 3')
  })

  it('가장 취약한 개념을 제목으로 권하고 그 개념의 문제 목록으로 보낸다', async () => {
    renderReport()
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: '동적 계획법 개념을 조금 더 연습해 볼까요?',
      }),
    ).toBeInTheDocument()
    // 문제 목록은 이름이 아니라 slug로 거른다
    expect(screen.getByRole('link', { name: '동적 계획법 문제 풀기' })).toHaveAttribute(
      'href',
      '/problems?tag=dp',
    )
  })

  it('내 학습 탭: 학습 리포트가 지금 화면이고 배지는 아직 꺼져 있다', async () => {
    renderReport()
    const nav = await screen.findByRole('navigation', { name: '내 학습 메뉴' })
    expect(within(nav).getByRole('link', { name: '학습 리포트' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).queryByRole('link', { name: /배지/ })).not.toBeInTheDocument()
    expect(within(nav).getByText('배지').closest('[aria-disabled]')).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  // 취약 여부는 서버의 `weak`만 따른다. 상위 2개·0점 규칙은 서버가 판단한다(계약).
  it('weak가 false인 개념에는 취약 표시가 없다', async () => {
    renderReport()
    const math = (await screen.findByText('수학')).closest('tr')!
    expect(within(math).queryByText('취약')).not.toBeInTheDocument()
  })

  it('남은 수가 계약 밖 음수여도 본문을 비우지 않고 표를 그린다', async () => {
    server.use(
      http.get('*/api/users/me/learning-stats', () =>
        HttpResponse.json({ ...learningStatsReady, remainingProblemCount: -1 }),
      ),
    )
    renderReport()
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('불러오지 못하면 오류와 다시 시도를 보여 준다', async () => {
    server.use(
      http.get('*/api/users/me/learning-stats', () =>
        HttpResponse.json({ code: 'INTERNAL', message: 'x' }, { status: 500 }),
      ),
    )
    renderReport()
    expect(await screen.findByRole('button', { name: /다시/ })).toBeInTheDocument()
  })
})
