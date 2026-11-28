import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { resetReports } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Component as AdminReportsPage } from './AdminReportsPage'

// 시드 신고 21개: 접수 4 · 확인 중 3 · 처리 완료 8 · 반려 5 · 문제 삭제됨 1 (fixtures/reports)
afterEach(() => resetReports())

function renderPage() {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, { id: 2, nickname: '관리자', role: 'ADMIN' })
  const router = createMemoryRouter([{ path: '/admin/reports', Component: AdminReportsPage }], {
    initialEntries: ['/admin/reports'],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const bodyRows = async () => (await screen.findAllByRole('row')).slice(1)

describe('AdminReportsPage (ADM-13)', () => {
  it('처리 안 한 신고 수, 상태 탭 여섯과 건수, 최신 신고부터 20개를 보인다', async () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: '신고' })).toBeInTheDocument()
    expect(await screen.findByText('7', { selector: 'b' })).toBeInTheDocument()
    const tabs = screen.getByRole('tablist', { name: '신고 상태' })
    expect(await within(tabs).findByRole('tab', { name: '문제 삭제됨, 1건' })).toBeInTheDocument()
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.getAttribute('aria-label')),
    ).toEqual([
      '전체, 21건',
      '접수, 4건',
      '확인 중, 3건',
      '처리 완료, 8건',
      '반려, 5건',
      '문제 삭제됨, 1건',
    ])

    const rows = await bodyRows()
    expect(rows).toHaveLength(20)
    expect(rows[0]).toHaveTextContent(/^21문자열 뒤집기입력\/출력 설명 오류코딩왕.*접수$/)
  })

  it('다음 페이지로 가면 남은 신고가 보인다', async () => {
    const user = userEvent.setup()
    renderPage()
    await bodyRows()

    await user.click(screen.getByRole('button', { name: '2페이지' }))
    const rows = await screen.findAllByRole('row')
    expect(rows.slice(1)).toHaveLength(1)
    expect(rows[1]).toHaveTextContent(/^1두 수의 합/)
  })

  it('탭을 고르면 그 상태의 신고만 보이고 1페이지로 돌아간다', async () => {
    const user = userEvent.setup()
    renderPage()
    await bodyRows()
    await user.click(screen.getByRole('button', { name: '2페이지' }))
    await screen.findByText(/^1$/, { selector: 'td' })

    await user.click(screen.getByRole('tab', { name: '접수, 4건' }))
    const rows = (await screen.findAllByRole('row')).slice(1)
    expect(rows.map((row) => (row as HTMLTableRowElement).cells[0]?.textContent)).toEqual([
      '21',
      '18',
      '10',
      '9',
    ])
    rows.forEach((row) => expect(row).toHaveTextContent(/접수$/))
    expect(screen.queryByRole('button', { name: '2페이지' })).not.toBeInTheDocument()
  })

  it('지워진 문제는 회색 (삭제된 문제)로, 탈퇴한 신고자는 탈퇴한 회원으로 보인다', async () => {
    renderPage()
    await bodyRows()

    // 제목은 신고 상세로 간다. 같은 문제의 신고가 여럿이라 이름에 번호를 붙인다
    const deleted = screen.getByRole('link', { name: '신고 5번 · (삭제된 문제) 연습 문제 13' })
    expect(deleted).toHaveAttribute('href', '/admin/reports/5')
    expect(deleted).toHaveClass('text-muted-foreground')
    expect(screen.getByRole('link', { name: '신고 21번 · 문자열 뒤집기' })).toHaveAttribute(
      'href',
      '/admin/reports/21',
    )
    const withdrawn = screen.getByRole('link', { name: '신고 8번 · 구간 합치기' }).closest('tr')!
    expect(within(withdrawn).getByText('탈퇴한 회원')).toHaveClass('text-muted-foreground')
    expect(within(withdrawn).queryByRole('link', { name: '탈퇴한 회원' })).not.toBeInTheDocument()
    // 신고자는 회원 상세로 간다 (ADM-15)
    const latest = screen.getByRole('link', { name: '신고 21번 · 문자열 뒤집기' }).closest('tr')!
    expect(within(latest).getByRole('link', { name: '코딩왕' })).toHaveAttribute(
      'href',
      '/admin/members/3',
    )
  })

  it('신고가 하나도 없으면 전체 탭에는 상태를 말하지 않는 안내를 보인다', async () => {
    server.use(
      http.get('*/api/admin/reports', () => HttpResponse.json({ content: [], totalElements: 0 })),
    )
    renderPage()
    expect(await screen.findByText('아직 들어온 신고가 없어요')).toBeInTheDocument()
    expect(screen.queryByText('이 상태의 신고가 없어요')).not.toBeInTheDocument()
  })

  it('그 상태의 신고가 없으면 빈 안내를 보인다', async () => {
    server.use(
      http.get('*/api/admin/reports', ({ request }) =>
        new URL(request.url).searchParams.getAll('status').join() === 'REJECTED'
          ? HttpResponse.json({ content: [], totalElements: 0 })
          : undefined,
      ),
    )
    const user = userEvent.setup()
    renderPage()
    await bodyRows()

    await user.click(await screen.findByRole('tab', { name: '반려, 0건' }))
    expect(await screen.findByText('이 상태의 신고가 없어요')).toBeInTheDocument()
  })
})
