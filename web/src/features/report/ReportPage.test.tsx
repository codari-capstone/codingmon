import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { learningStatsShort } from '@/mocks/fixtures/learning'
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
    expect(dp[1]).toHaveTextContent('25%(1/4)')
    expect(dp[2]).toHaveTextContent('2.5')
    expect(dp[3]).toHaveTextContent('4.5')
    expect(dp[4]).toHaveTextContent('0.8')

    // 서버가 둘째 자리까지 반올림한 값(0.33)을 다시 계산하지 않고 33%로 옮긴다
    expect(within(rows[1]).getAllByRole('cell')[1]).toHaveTextContent('33%(1/3)')
  })

  // 취약 여부는 서버의 `weak`만 따른다. 상위 2개·0점 규칙은 서버가 판단한다(계약).
  it('weak가 false인 개념에는 취약 표시가 없다', async () => {
    renderReport()
    const math = (await screen.findByText('수학')).closest('tr')!
    expect(within(math).queryByText('취약')).not.toBeInTheDocument()
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
