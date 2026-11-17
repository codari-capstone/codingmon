import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { server } from '@/mocks/server'
import { Component as AdminDashboardPage } from './AdminDashboardPage'

// 시드 신고 21개: 접수 4 · 확인 중 3 · … (fixtures/reports). 최신은 21번
function renderPage() {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, { id: 2, nickname: '관리자', role: 'ADMIN' })
  const router = createMemoryRouter([{ path: '/admin/dashboard', Component: AdminDashboardPage }], {
    initialEntries: ['/admin/dashboard'],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('AdminDashboardPage (ADM-12)', () => {
  it('처리 안 한 신고 수와 상태별 내역, 최근 신고 5개를 보인다', async () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: '대시보드' })).toBeInTheDocument()
    const card = screen.getByRole('region', { name: '처리할 신고' })
    expect(await within(card).findByText('7')).toBeInTheDocument()
    expect(await within(card).findByText('접수 4건 · 확인 중 3건')).toBeInTheDocument()
    expect(within(card).getByRole('link', { name: '신고 처리하러 가기' })).toHaveAttribute(
      'href',
      '/admin/reports',
    )

    const recent = screen.getByRole('region', { name: '최근 신고' })
    const rows = (await within(recent).findAllByRole('row')).slice(1)
    expect(rows.map((row) => (row as HTMLTableRowElement).cells[0]?.textContent)).toEqual([
      '21',
      '20',
      '19',
      '18',
      '17',
    ])
    expect(within(recent).getByRole('link', { name: '전체 보기 →' })).toHaveAttribute(
      'href',
      '/admin/reports',
    )
  })

  it('신고가 없으면 빈 안내를 보인다', async () => {
    server.use(
      http.get('*/api/admin/reports', () => HttpResponse.json({ content: [], totalElements: 0 })),
    )
    renderPage()

    expect(await screen.findByText('아직 들어온 신고가 없어요')).toBeInTheDocument()
    expect(screen.getByText('접수 0건 · 확인 중 0건')).toBeInTheDocument()
  })
})
