import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { Component as AdminMemberDetailPage } from './AdminMemberDetailPage'

// 시드(fixtures/adminUsers): 1 코다리(정상, 제출 92·푼 문제 12), 2 관리자, 3 코딩왕(50시간 전 정지·사유 있음),
// 8 밤샘코더(2시간 전 정지·사유 없음). 제출·푼 문제는 1·3만 있다
function renderPage(id: number | string) {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, { id: 2, nickname: '관리자', role: 'ADMIN' })
  const router = createMemoryRouter(
    [{ path: '/admin/members/:id', Component: AdminMemberDetailPage }],
    { initialEntries: [`/admin/members/${id}`] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('AdminMemberDetailPage (ADM-15)', () => {
  it('기본 정보, 오늘 AI 사용, 푼 문제, 제출 목록을 보인다', async () => {
    renderPage(1)

    expect(await screen.findByRole('heading', { level: 1, name: '코다리' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '현재 위치' })).toHaveTextContent('회원코다리')
    expect(screen.getByText('— (기록 전 가입)')).toBeInTheDocument()
    expect(screen.queryByText('정지된 계정이에요')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'AI 분석·리뷰' })).toHaveAttribute(
      'aria-valuemax',
      '20',
    )
    expect(screen.getByText(/하루 한도 20회 · 오전 9시에 다시 채워져요/)).toBeInTheDocument()

    const solved = screen.getByRole('region', { name: '푼 문제' })
    expect(await within(solved).findByText('12개')).toBeInTheDocument()
    expect(within(solved).getByRole('cell', { name: '역방향 피라미드' })).toBeInTheDocument()

    const submissions = screen.getByRole('region', { name: '제출 목록' })
    expect(await within(submissions).findByText('총 92개')).toBeInTheDocument()
    expect(within(submissions).getAllByRole('row')).toHaveLength(21)
    expect(within(submissions).getByRole('button', { name: '5페이지' })).toBeInTheDocument()
  })

  it('제출을 펼치면 코드와 결과·시간·메모리가 보이고, 다시 누르면 접힌다', async () => {
    const user = userEvent.setup()
    renderPage(1)
    const submissions = await screen.findByRole('region', { name: '제출 목록' })
    const open = await within(submissions).findByRole('button', {
      name: '코드와 결과 보기: 제출 #1193',
    })

    await user.click(open)
    expect(await within(submissions).findByText('script.py')).toBeInTheDocument()
    expect(within(submissions).getByText('100ms')).toBeInTheDocument()
    expect(within(submissions).getByText('30,000KB')).toBeInTheDocument()

    await user.click(within(submissions).getByRole('button', { name: '접기: 제출 #1193' }))
    expect(within(submissions).queryByText('script.py')).not.toBeInTheDocument()
  })

  it('정지하고 24시간이 지난 회원은 배너에 사유와 강제 탈퇴할 수 있음을 보인다', async () => {
    renderPage(3)
    expect(await screen.findByText('정지된 계정이에요')).toBeInTheDocument()
    expect(screen.getByText('사유: 다른 사람의 풀이를 그대로 제출함')).toBeInTheDocument()
    expect(screen.getByText(/24시간이 지나 강제 탈퇴할 수 있어요/)).toBeInTheDocument()
  })

  it('정지한 지 24시간이 안 됐으면 배너에 강제 탈퇴 안내가 없고, 사유가 없으면 사유 줄도 없다', async () => {
    renderPage(8)
    expect(await screen.findByText('정지된 계정이에요')).toBeInTheDocument()
    expect(screen.queryByText(/강제 탈퇴할 수 있어요/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^사유:/)).not.toBeInTheDocument()
  })

  it('제출이 없는 회원은 빈 안내를 보인다', async () => {
    renderPage(2)
    expect(await screen.findByRole('heading', { level: 1, name: '관리자' })).toBeInTheDocument()
    expect(await screen.findByText('아직 제출이 없어요.')).toBeInTheDocument()
    expect(await screen.findByText('아직 맞힌 문제가 없어요.')).toBeInTheDocument()
  })

  it('없는 회원이면 목록으로 돌아갈 길을 준다', async () => {
    renderPage(999)
    expect(await screen.findByText('회원을 찾을 수 없어요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '회원 목록으로' })).toHaveAttribute(
      'href',
      '/admin/members',
    )
  })
})
