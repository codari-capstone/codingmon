import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { server } from '@/mocks/server'
import { Component as AdminDashboardPage } from './AdminDashboardPage'
import { paymentNeedsCancelCountQuery } from './adminUserQuery'

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
  return client
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

  it('신고 수만 실패해도 오류를 알리고, 다시 시도하면 수를 다시 받는다', async () => {
    const user = userEvent.setup()
    let failing = true
    server.use(
      http.get('*/api/admin/reports', ({ request }) => {
        const status = new URL(request.url).searchParams.getAll('status')
        if (failing && status.length === 1 && status[0] === 'RECEIVED') {
          return HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 })
        }
        return undefined
      }),
    )
    renderPage()

    // retry: 1이라 오류 상태가 1초 뒤에 온다(ProblemFilters.test.tsx와 같은 이유)
    const retry = await screen.findByRole('button', { name: '다시 시도' }, { timeout: 3000 })
    expect(screen.getByText('접수 –건 · 확인 중 3건')).toBeInTheDocument()
    expect((await screen.findAllByRole('row')).length).toBe(6)

    failing = false
    await user.click(retry)
    expect(await screen.findByText('접수 4건 · 확인 중 3건')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  it('취소가 필요한 결제가 있는 회원 수를 카드로 보이고, 누르면 그 회원만 걸러 본다', async () => {
    let asked: URLSearchParams | undefined
    server.use(
      http.get('*/api/admin/users', ({ request }) => {
        asked = new URL(request.url).searchParams
        return HttpResponse.json({
          content: [],
          totalElements: 2,
          counts: { all: 2, active: 2, suspended: 0 },
        })
      }),
    )
    renderPage()

    const card = screen.getByRole('region', { name: '취소·확인이 필요한 결제' })
    expect(await within(card).findByText('2')).toBeInTheDocument()
    expect(within(card).getByRole('link')).toHaveAttribute(
      'href',
      '/admin/members?paymentNeedsCancel=true',
    )
    expect(asked?.get('paymentNeedsCancel')).toBe('true')
    expect(asked?.get('size')).toBe('1')
  })

  it('신고 수가 500이어도 결제 수가 401이면 세션을 버린다', async () => {
    server.use(
      http.get('*/api/admin/reports', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
      http.get('*/api/admin/users', () => HttpResponse.json({ status: 401 }, { status: 401 })),
    )
    const client = renderPage()

    // retry: 1이라 오류가 1초 뒤에 온다
    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull(), { timeout: 3000 })
  })

  it('결제 수를 받기 전에는 카드 줄을 감춰, 카드가 끼어들며 신고 버튼이 옮겨지지 않게 한다', async () => {
    server.use(
      http.get('*/api/admin/users', () =>
        HttpResponse.json({
          content: [],
          totalElements: 1,
          counts: { all: 1, active: 1, suspended: 0 },
        }),
      ),
    )
    renderPage()

    expect(screen.getByTestId('dashboard-cards')).toHaveClass('invisible')
    // 받기 전에도 결제 카드가 자리를 잡는다. 받은 뒤 끼어들면 좁은 화면에서 아래 목록이 밀린다(#380 리뷰)
    const card = screen.getByRole('region', { name: '취소·확인이 필요한 결제' })
    expect(await within(card).findByText('1')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-cards')).not.toHaveClass('invisible')
  })

  it('결제 수를 다시 받다 실패하면 지난 0을 처리할 결제 없음으로 보이지 않는다 (#380 리뷰)', async () => {
    const client = renderPage()
    const card = screen.getByRole('region', { name: '취소·확인이 필요한 결제' })
    // 받기 전에도 같은 문구가 감춰진 줄에 있다. 캐시에 0이 든 것을 기다려야 '지난 0'을 시험한다(#380 리뷰)
    await waitFor(() =>
      expect(client.getQueryData(paymentNeedsCancelCountQuery().queryKey)).toBe(0),
    )
    expect(within(card).getByText('0')).toBeInTheDocument()

    // 포트원 콘솔에 다녀와 창으로 돌아왔을 때(refetchOnWindowFocus) 다시 받기가 실패한 것과 같다
    server.use(
      http.get('*/api/admin/users', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    )
    void client.refetchQueries({ queryKey: paymentNeedsCancelCountQuery().queryKey })

    // retry: 1이라 오류가 1초 뒤에 온다
    expect(
      await within(card).findByText('결제 수를 확인하지 못했어요.', undefined, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(within(card).getByText('–')).toBeInTheDocument()
    expect(within(card).queryByText('지금은 처리할 결제가 없어요.')).not.toBeInTheDocument()
    // 캐시에는 지난 0이 그대로 있다. 그래도 보이지 않는 것이 이 테스트가 지키는 것이다
    expect(client.getQueryData(paymentNeedsCancelCountQuery().queryKey)).toBe(0)
  })

  it('취소·확인이 필요한 결제가 없어도 0명 카드를 보이고, 갈 곳이 없어 링크는 두지 않는다', async () => {
    // 목 회원은 결제 기록이 없어 0명이다. 응답을 받아 그린 뒤에 확인한다
    const client = renderPage()

    await waitFor(() =>
      expect(client.getQueryData(paymentNeedsCancelCountQuery().queryKey)).toBe(0),
    )
    const card = screen.getByRole('region', { name: '취소·확인이 필요한 결제' })
    expect(within(card).getByText('0')).toBeInTheDocument()
    expect(within(card).getByText('지금은 처리할 결제가 없어요.')).toBeInTheDocument()
    expect(within(card).queryByRole('link')).not.toBeInTheDocument()
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
