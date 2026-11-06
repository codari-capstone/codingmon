import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { CurrentUser } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { activityFor } from '@/mocks/fixtures/activity'
import { server } from '@/mocks/server'
import { Component as MyPage } from './MyPage'

const EMAIL_USER: CurrentUser = {
  id: 1,
  nickname: '코다리',
  role: 'USER',
  avatarUrl: null,
  email: 'us***@codari.test',
  loginMethod: 'EMAIL',
  githubUsername: null,
}

const GITHUB_USER: CurrentUser = {
  id: 3,
  nickname: '깃허브',
  role: 'USER',
  avatarUrl: 'https://avatars.example/3.png',
  email: null,
  loginMethod: 'GITHUB',
  githubUsername: 'octo-kim',
}

/** `activity`가 숫자면 그 사용자의 fixture, 'error'면 500을 준다. */
function renderMyPage(user: CurrentUser, activity: number | 'error' = user.id) {
  server.use(
    http.get('*/api/users/me/activity', () =>
      activity === 'error'
        ? HttpResponse.json({ status: 500, title: 'x' }, { status: 500 })
        : HttpResponse.json(activityFor(activity)),
    ),
  )
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, user)
  const router = createMemoryRouter([{ path: '/me', Component: MyPage }], {
    initialEntries: ['/me'],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

describe('MyPage 계정 정보 (MY-01)', () => {
  it('이메일 가입자는 가린 이메일과 로그인 방식을 보고, GitHub 아이디 줄은 없다', async () => {
    renderMyPage(EMAIL_USER)
    const account = await screen.findByRole('region', { name: '계정 정보' })

    expect(within(account).getByText('코다리')).toBeInTheDocument()
    expect(within(account).getByText('us***@codari.test')).toBeInTheDocument()
    // '이메일'은 로그인 방식 값이자 이메일 줄의 이름이라 두 번 나온다
    expect(within(account).getByText('로그인 방식').nextElementSibling).toHaveTextContent('이메일')
    expect(within(account).queryByText('GitHub 아이디')).not.toBeInTheDocument()
  })

  it('GitHub 가입자는 GitHub 아이디를 보고, 이메일 줄은 없다', async () => {
    renderMyPage(GITHUB_USER, 1)
    const account = await screen.findByRole('region', { name: '계정 정보' })

    expect(within(account).getByText('octo-kim')).toBeInTheDocument()
    expect(within(account).getByText('GitHub')).toBeInTheDocument()
    expect(within(account).queryByText('이메일')).not.toBeInTheDocument()
  })
})

describe('MyPage 풀이 요약·활동 기록 (MY-05)', () => {
  it('맞힌·틀린 수, 난이도별 맞힌 수, 총 활동일과 잔디 요약을 보여 준다', async () => {
    renderMyPage(EMAIL_USER)
    const activity = activityFor(1)

    const summary = await screen.findByRole('region', { name: '풀이 요약' })
    // 구역은 먼저 그려지고 숫자는 응답 뒤에 온다
    expect((await within(summary).findByText('맞힌 문제')).nextElementSibling).toHaveTextContent(
      '7',
    )
    expect(within(summary).getByText('맞힌 문제').nextElementSibling).toHaveTextContent('7')
    expect(within(summary).getByText('틀린 문제').nextElementSibling).toHaveTextContent('3')
    expect(within(summary).getByText(/난이도별 맞힌 문제/)).toHaveTextContent(
      '쉬움 4, 보통 2, 어려움 1',
    )
    expect(within(summary).getByText(`총 ${activity.totalActiveDays}일`)).toBeInTheDocument()
    expect(
      within(summary).getByRole('img', {
        name: `최근 1년 동안 ${activity.totalActiveDays}일 제출했어요`,
      }),
    ).toBeInTheDocument()
    expect(within(summary).getByRole('link', { name: '내 학습' })).toHaveAttribute(
      'href',
      '/me/report',
    )
    expect(within(summary).getByRole('link', { name: '제출 기록' })).toHaveAttribute(
      'href',
      '/submissions',
    )
  })

  it('제출이 없으면 숫자는 0이고 안내 문구를 띄운다', async () => {
    renderMyPage(EMAIL_USER, 2)
    expect(await screen.findByText('아직 제출한 문제가 없어요.')).toBeInTheDocument()
    expect(screen.getByText('맞힌 문제').nextElementSibling).toHaveTextContent('0')
    expect(screen.getByRole('img', { name: '최근 1년 동안 0일 제출했어요' })).toBeInTheDocument()
  })

  it('불러오지 못하면 오류와 다시 시도를 보여 준다', async () => {
    renderMyPage(EMAIL_USER, 'error')
    expect(await screen.findByRole('button', { name: /다시/ })).toBeInTheDocument()
  })
})
