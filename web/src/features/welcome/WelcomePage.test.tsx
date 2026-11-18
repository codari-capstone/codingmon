import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { StrictMode } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setAccessToken } from '@/api/session'
import type { CurrentUser } from '@/api/types'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { problemDetails } from '@/mocks/fixtures/problemDetails'
import { mockAccessToken, mockAccounts } from '@/mocks/fixtures/users'
import { server } from '@/mocks/server'
import { Component as WelcomePage } from './WelcomePage'

const me: CurrentUser = { ...mockAccounts[0]!.user, welcomeSeen: false }

beforeEach(() => setAccessToken(mockAccessToken(me.id)))
afterEach(() => setAccessToken(null))

function renderWelcome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  client.setQueryData(ME_QUERY_KEY, me)
  const router = createMemoryRouter(
    [
      { path: '/welcome', Component: WelcomePage },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
      { path: '/problems/:id', element: <h1>풀이 도착</h1> },
    ],
    { initialEntries: ['/welcome'] },
  )
  render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </StrictMode>,
  )
  return { router, client }
}

/** 언어 → 경험 → 목표를 골라 추천 단계까지 간다 */
async function answerAll(
  user: ReturnType<typeof userEvent.setup>,
  lang: string,
  exp: string,
  goal: string,
) {
  await user.click(screen.getByRole('radio', { name: new RegExp(lang) }))
  await user.click(screen.getByRole('button', { name: '다음' }))
  await user.click(screen.getByRole('radio', { name: exp }))
  await user.click(screen.getByRole('button', { name: '다음' }))
  await user.click(screen.getByRole('radio', { name: goal }))
  await user.click(screen.getByRole('button', { name: '다음' }))
}

describe('처음 안내 (WELCOME-01~03)', () => {
  it('열리면 봤음을 한 번 기록하고 내 정보에도 반영한다', async () => {
    let calls = 0
    server.use(
      http.post('*/api/users/me/welcome-seen', () => {
        calls += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const { client } = renderWelcome()

    await waitFor(() =>
      expect(client.getQueryData<CurrentUser>(ME_QUERY_KEY)?.welcomeSeen).toBe(true),
    )
    // StrictMode가 효과를 두 번 돌려도 요청은 한 번이다
    expect(calls).toBe(1)
  })

  it('기록이 실패해도 질문을 이어 갈 수 있다', async () => {
    server.use(
      http.post('*/api/users/me/welcome-seen', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    )
    const user = userEvent.setup()
    renderWelcome()

    await user.click(screen.getByRole('radio', { name: /Python/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(screen.getByText('질문 2 / 3')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('고르기 전에는 [다음]이 꺼져 있고, [이전]으로 돌아가면 고른 답이 남아 있다', async () => {
    const user = userEvent.setup()
    renderWelcome()

    expect(screen.getByText('질문 1 / 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /C\+\+/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByText('질문 2 / 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '이전' }))
    expect(screen.getByText('질문 1 / 3')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /C\+\+/ })).toBeChecked()
  })

  it('단계가 바뀌면 제목으로 포커스를 옮긴다', async () => {
    const user = userEvent.setup()
    renderWelcome()

    await user.click(screen.getByRole('radio', { name: /Python/ }))
    await user.click(screen.getByRole('button', { name: '다음' }))

    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
  })

  it('모든 질문 단계의 [건너뛰기]는 문제 목록으로 간다', async () => {
    const user = userEvent.setup()
    renderWelcome()

    for (const pick of [/Python/, '처음이에요', '기초 문법 익히기']) {
      expect(screen.getByRole('link', { name: '건너뛰기' })).toHaveAttribute('href', '/problems')
      await user.click(screen.getByRole('radio', { name: pick }))
      await user.click(screen.getByRole('button', { name: '다음' }))
    }
    expect(screen.getByRole('link', { name: '건너뛰기' })).toHaveAttribute('href', '/problems')
  })

  it('추천 단계는 표의 문제를 보여 주고, 고른 언어로 풀이 화면을 연다', async () => {
    const user = userEvent.setup()
    renderWelcome()

    await answerAll(user, 'C\\+\\+', '몇 문제 풀어 봤어요', '알고리즘 실력 키우기')

    const problem = problemDetails.find((p) => p.id === 5)!
    expect(await screen.findByText(problem.title)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '첫 문제 풀러 가기' })).toHaveAttribute(
      'href',
      '/problems/5?language=CPP',
    )
  })

  it('추천 문제를 받는 동안에는 풀이로 보내지 않고, 받으면 낭독기에 알린다', async () => {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const problem = problemDetails.find((p) => p.id === 1)!
    server.use(
      http.get('*/api/problems/:id', async () => {
        await held
        return HttpResponse.json(problem)
      }),
    )
    const user = userEvent.setup()
    renderWelcome()

    await answerAll(user, 'Python', '처음이에요', '기초 문법 익히기')

    expect(screen.getByRole('button', { name: '첫 문제 풀러 가기' })).toBeDisabled()
    expect(screen.queryByRole('link', { name: '첫 문제 풀러 가기' })).not.toBeInTheDocument()

    release()
    expect(await screen.findByRole('link', { name: '첫 문제 풀러 가기' })).toBeInTheDocument()
    expect(
      screen.getAllByRole('status').some((el) => el.textContent?.includes(problem.title)),
    ).toBe(true)
  })

  it('추천 문제를 열 수 없으면 문제 목록으로 보낸다', async () => {
    server.use(
      http.get('*/api/problems/:id', () =>
        HttpResponse.json(
          { status: 404, title: 'Not Found', code: 'PROBLEM_NOT_FOUND' },
          { status: 404 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderWelcome()

    await answerAll(user, 'Python', '처음이에요', '기초 문법 익히기')

    expect(await screen.findByRole('link', { name: '문제 목록 보기' })).toHaveAttribute(
      'href',
      '/problems',
    )
    expect(screen.queryByRole('link', { name: '첫 문제 풀러 가기' })).not.toBeInTheDocument()
  })
})
