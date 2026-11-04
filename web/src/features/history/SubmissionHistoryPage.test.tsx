import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { server } from '@/mocks/server'
import { Component as SubmissionHistoryPage } from './SubmissionHistoryPage'

function renderHistory(url = '/submissions') {
  const router = createMemoryRouter(
    [
      { path: '/submissions', Component: SubmissionHistoryPage },
      { path: '/submissions/problems/:problemId', element: <h1>제출 목록 도착</h1> },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
    ],
    { initialEntries: [url] },
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

describe('SubmissionHistoryPage (HIST-01)', () => {
  it('문제별로 난이도·맞힘 여부·시도 횟수·힌트 단계를 보여 준다', async () => {
    renderHistory()

    const row = (await screen.findByRole('link', { name: '역방향 피라미드' })).closest('tr')!
    expect(within(row).getByText('쉬움')).toBeInTheDocument()
    expect(within(row).getByText('맞음')).toBeInTheDocument()
    expect(within(row).getByText('3')).toBeInTheDocument()
    expect(within(row).getByText('2단계')).toBeInTheDocument()

    // 힌트를 열지 않았으면 0단계가 아니라 줄을 비운다
    const noHint = screen.getByRole('link', { name: 'A+B' }).closest('tr')!
    expect(within(noHint).getByText('—')).toBeInTheDocument()
    expect(screen.getByText('제출한 문제 23개')).toBeInTheDocument()
  })

  it('문제를 누르면 그 문제의 제출 목록으로 간다', async () => {
    const router = renderHistory()
    await userEvent.click(await screen.findByRole('link', { name: '구간 합 구하기' }))
    expect(router.state.location.pathname).toBe('/submissions/problems/2')
  })

  it('23개는 두 페이지이고 2페이지에서 나머지 3개를 보여 준다', async () => {
    const router = renderHistory()
    await screen.findByRole('link', { name: 'A+B' })
    await userEvent.click(screen.getByRole('button', { name: '2페이지' }))

    expect(await screen.findByRole('link', { name: '연습 문제 18' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'A+B' })).not.toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2')
  })

  it('결과보다 뒤인 페이지는 마지막 페이지로 되돌린다', async () => {
    const router = renderHistory('/submissions?page=9')
    expect(await screen.findByRole('link', { name: '연습 문제 18' })).toBeInTheDocument()
    expect(router.state.location.search).toBe('?page=2')
  })

  it('제출한 문제가 없으면 문제 목록으로 가는 길을 알려 준다', async () => {
    server.use(
      http.get('*/api/users/me/problem-history', () =>
        HttpResponse.json({ content: [], totalElements: 0 }),
      ),
    )
    renderHistory()
    expect(await screen.findByText('아직 제출한 문제가 없어요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문제 보러 가기' })).toHaveAttribute(
      'href',
      '/problems',
    )
  })

  it('서버 오류는 다시 시도 버튼과 함께 보여 준다', async () => {
    server.use(
      http.get('*/api/users/me/problem-history', () =>
        HttpResponse.json({ status: 500 }, { status: 500 }),
      ),
    )
    renderHistory()
    expect(await screen.findByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})
