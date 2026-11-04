import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { server } from '@/mocks/server'
import { Component as ProblemSubmissionsPage } from './ProblemSubmissionsPage'

function renderList(url: string, client = createQueryClient()) {
  const router = createMemoryRouter(
    [
      { path: '/submissions/problems/:problemId', Component: ProblemSubmissionsPage },
      { path: '/submissions', element: <h1>제출 기록 도착</h1> },
    ],
    { initialEntries: [url] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('ProblemSubmissionsPage (HIST-02)', () => {
  it('위에 문제 정보, 아래에 채점이 끝난 제출을 최신순으로 보여 준다', async () => {
    renderList('/submissions/problems/2')

    expect(await screen.findByRole('heading', { name: '구간 합 구하기' })).toBeInTheDocument()
    expect(screen.getByText(/보통 · 못 맞힘 · 시도 5회 · 힌트 3단계/)).toBeInTheDocument()

    const rows = within(await screen.findByRole('table'))
      .getAllByRole('row')
      .slice(1)
    // 최신순: 채점 불가가 맨 위. 못 맞힌 문제라 정답 제출이 없다
    expect(within(rows[0]).getByText('채점 불가')).toBeInTheDocument()
    expect(within(rows[1]).getByText('틀렸습니다')).toBeInTheDocument()
    expect(within(rows[3]).getByText('시간 초과')).toBeInTheDocument()
    expect(screen.queryByText('맞았습니다!!')).not.toBeInTheDocument()
    expect(rows).toHaveLength(4)
  })

  it('채점 불가는 시간·메모리를 0이 아니라 줄표로 보여 준다', async () => {
    renderList('/submissions/problems/2')
    const rows = within(await screen.findByRole('table'))
      .getAllByRole('row')
      .slice(1)
    expect(within(rows[0]).getAllByText('—')).toHaveLength(2)
    expect(within(rows[0]).queryByText('0ms')).not.toBeInTheDocument()
  })

  it('제출 번호는 결과 화면으로 가는 링크다', async () => {
    renderList('/submissions/problems/2')
    const link = await screen.findByRole('link', { name: '#23' })
    expect(link).toHaveAttribute('href', '/submissions/23')
  })

  it('문제 기록이 404면 제출 목록과 관계없이 기록 없음을 보여 준다', async () => {
    renderList('/submissions/problems/999')
    expect(await screen.findByText('이 문제의 제출 기록이 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('번호가 아닌 주소는 요청 없이 기록 없음으로 끝난다', async () => {
    renderList('/submissions/problems/abc')
    expect(await screen.findByText('이 문제의 제출 기록이 없어요')).toBeInTheDocument()
  })

  it.each([
    ['문제 정보', '*/api/users/me/problem-history/:problemId'],
    ['제출 목록', '*/api/submissions'],
  ])('%s가 401이면 세션을 버려 로그인 화면으로 보낼 수 있게 한다', async (_name, path) => {
    const client = createQueryClient()
    client.setQueryData(ME_QUERY_KEY, { id: 1, nickname: '코다리', role: 'USER' })
    server.use(http.get(path, () => HttpResponse.json({ status: 401 }, { status: 401 })))

    renderList('/submissions/problems/2', client)

    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull())
  })

  it('문제 정보가 일시적으로 5xx면 한 번 다시 시도한다', async () => {
    server.use(
      http.get(
        '*/api/users/me/problem-history/:problemId',
        () => HttpResponse.json({ status: 502 }, { status: 502 }),
        { once: true },
      ),
    )
    renderList('/submissions/problems/2')
    expect(await screen.findByRole('heading', { name: '구간 합 구하기' })).toBeInTheDocument()
  })

  it('제출이 하나도 없으면 안내한다', async () => {
    server.use(
      http.get('*/api/submissions', () => HttpResponse.json({ content: [], totalElements: 0 })),
    )
    renderList('/submissions/problems/2')
    expect(await screen.findByText('채점이 끝난 제출이 없어요')).toBeInTheDocument()
  })
})
