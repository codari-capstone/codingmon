import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { Component as AdminMembersPage } from './AdminMembersPage'

// 닉네임 칸 글은 아바타의 첫 글자가 앞에 붙는다(코코린이).
// 시드 회원 24명: 정지 2(3 코딩왕·8 밤샘코더), 관리자 2번, 가입일 없음 1~4, GitHub 6·10·16 (fixtures/adminUsers)
function renderPage() {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, { id: 2, nickname: '관리자', role: 'ADMIN' })
  const router = createMemoryRouter([{ path: '/admin/members', Component: AdminMembersPage }], {
    initialEntries: ['/admin/members'],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

const firstCells = async () =>
  (await screen.findAllByRole('row'))
    .slice(1)
    .map((row) => (row as HTMLTableRowElement).cells[0]?.textContent)

const tabTexts = () =>
  within(screen.getByRole('tablist', { name: '회원 상태' }))
    .getAllByRole('tab')
    .map((tab) => tab.textContent)

describe('AdminMembersPage (ADM-14)', () => {
  it('탭 개수와 최근 가입한 회원부터 20명을 보인다', async () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: '회원' })).toBeInTheDocument()
    expect(await firstCells()).toHaveLength(20)
    expect(tabTexts()).toEqual(['전체24', '정상22', '정지2'])
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent(/^24코코린이newbie@example\.com\d{4}-\d{2}-\d{2}정상$/)
    // GitHub로 가입한 회원은 이메일 대신 '(GitHub)'
    expect(rows[9]).toHaveTextContent(/^16큐큐대기열\(GitHub\)/)
    // 아바타는 장식이다. 이름 옆이라 그림으로도 읽히면 줄마다 이름이 두 번 들린다
    expect(within(rows[1]!).queryByRole('img')).not.toBeInTheDocument()
  })

  it('다음 페이지에서 가입일 없는 회원은 —, 관리자에는 배지, 정지 회원은 정지로 보인다', async () => {
    const user = userEvent.setup()
    renderPage()
    await firstCells()

    await user.click(screen.getByRole('button', { name: '2페이지' }))
    expect(await screen.findByText('king@example.com')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      '4알알고펭algo.peng@example.com—정상',
      '3코코딩왕king@example.com—정지',
      '2관관리자관리자admin@codari.test—정상',
      '1코코다리user@codari.test—정상',
    ])
  })

  it('정지 탭은 정지된 회원만 보인다', async () => {
    const user = userEvent.setup()
    renderPage()
    await firstCells()

    await user.click(screen.getByRole('tab', { name: '정지2' }))
    expect(await screen.findByText('nightowl@example.com')).toBeInTheDocument()
    expect(await firstCells()).toEqual(['8', '3'])
    expect(screen.queryByRole('button', { name: '2페이지' })).not.toBeInTheDocument()
  })

  it('숫자로 찾으면 그 ID의 회원이 나오고 탭 개수도 검색 결과로 바뀐다', async () => {
    const user = userEvent.setup()
    renderPage()
    await firstCells()

    await user.type(screen.getByRole('searchbox', { name: '이메일 · 닉네임 · ID로 검색' }), ' 3 ')
    expect(await screen.findByRole('tab', { name: '전체1' })).toBeInTheDocument()
    expect(tabTexts()).toEqual(['전체1', '정상0', '정지1'])
    expect(await firstCells()).toEqual(['3'])
  })

  it('맞는 회원이 없으면 그렇게 말한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await firstCells()

    await user.type(
      screen.getByRole('searchbox', { name: '이메일 · 닉네임 · ID로 검색' }),
      '없는사람',
    )
    expect(await screen.findByText('조건에 맞는 회원이 없어요')).toBeInTheDocument()
  })
})
