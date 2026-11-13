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

/** StatCard의 숫자. 이름(span)은 아이콘과 같은 줄 div 안에 있고, 숫자는 그 div 다음 문단이다. */
function statValue(scope: HTMLElement, label: string) {
  return within(scope).getByText(label).closest('div')!.nextElementSibling
}

describe('MyPage 계정 정보 (MY-01)', () => {
  it('이메일 가입자는 가린 이메일과 로그인 방식을 보고, GitHub 아이디는 없다', async () => {
    renderMyPage(EMAIL_USER)
    const account = await screen.findByRole('region', { name: '계정 정보' })

    expect(within(account).getByText('코다리')).toBeInTheDocument()
    expect(within(account).getByText('us***@codari.test')).toBeInTheDocument()
    expect(within(account).getByText('이메일 로그인')).toBeInTheDocument()
    expect(within(account).queryByText(/GitHub/)).not.toBeInTheDocument()
  })

  it('GitHub 가입자는 GitHub 아이디를 보고, 이메일은 없다', async () => {
    renderMyPage(GITHUB_USER, 1)
    const account = await screen.findByRole('region', { name: '계정 정보' })

    expect(within(account).getByText('octo-kim')).toBeInTheDocument()
    expect(within(account).getByText('GitHub 로그인')).toBeInTheDocument()
    expect(within(account).queryByText(/@/)).not.toBeInTheDocument()
  })

  it('프로필 수정은 계정 설정 화면으로 간다', async () => {
    renderMyPage(EMAIL_USER)
    const account = await screen.findByRole('region', { name: '계정 정보' })
    expect(within(account).getByRole('link', { name: '프로필 수정' })).toHaveAttribute(
      'href',
      '/me/account',
    )
    // 계정 설정은 이 화면에 없다(#243)
    expect(screen.queryByLabelText('닉네임')).not.toBeInTheDocument()
  })
})

describe('MyPage 사이드바 (MyNav)', () => {
  it('지금 화면을 표시하고, 메뉴마다 그 화면으로 간다', async () => {
    renderMyPage(EMAIL_USER)
    const nav = await screen.findByRole('navigation', { name: '마이페이지 메뉴' })

    expect(within(nav).getByRole('link', { name: /프로필 · 학습 요약/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const href = (name: RegExp) => within(nav).getByRole('link', { name }).getAttribute('href')
    expect(href(/계정 설정/)).toBe('/me/account')
    expect(href(/화면 설정/)).toBe('/me/display')
    expect(href(/회원 탈퇴/)).toBe('/me/withdraw')
    expect(within(nav).getByRole('button', { name: /로그아웃/ })).toBeInTheDocument()
  })

  it('관리자에게는 회원 탈퇴 메뉴가 없다', async () => {
    renderMyPage({ ...EMAIL_USER, role: 'ADMIN' })
    const nav = await screen.findByRole('navigation', { name: '마이페이지 메뉴' })
    expect(within(nav).queryByRole('link', { name: /회원 탈퇴/ })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /계정 설정/ })).toBeInTheDocument()
  })
})

describe('MyPage 계정 정보 — 서버가 새 필드를 아직 보내지 않을 때 (#185 전)', () => {
  it('빠진 값은 없는 것으로 보고 빈 줄을 그리지 않는다', async () => {
    // 지금 서버의 응답 모양: id·nickname·role·avatarUrl만 온다
    const legacy = { id: 1, nickname: '코다리', role: 'USER', avatarUrl: null } as CurrentUser
    renderMyPage(legacy)
    const account = await screen.findByRole('region', { name: '계정 정보' })

    expect(within(account).getByText('코다리')).toBeInTheDocument()
    expect(within(account).queryByText(/로그인/)).not.toBeInTheDocument()
    expect(within(account).queryByText(/@/)).not.toBeInTheDocument()
    expect(within(account).queryByText(/GitHub/)).not.toBeInTheDocument()
  })
})

describe('MyPage 풀이 요약·활동 기록 (MY-05)', () => {
  it('최근 1년에는 제출이 없지만 전에 푼 문제가 있으면 기간을 밝혀 안내한다', async () => {
    server.use(
      http.get('*/api/users/me/activity', () =>
        HttpResponse.json({ ...activityFor(1), days: [], totalActiveDays: 0 }),
      ),
    )
    const client = createQueryClient()
    client.setQueryData(ME_QUERY_KEY, EMAIL_USER)
    const router = createMemoryRouter([{ path: '/me', Component: MyPage }], {
      initialEntries: ['/me'],
    })
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText('최근 1년 동안 제출한 날이 없어요.')).toBeInTheDocument()
    expect(screen.queryByText('아직 제출한 문제가 없어요.')).not.toBeInTheDocument()
    expect(statValue(document.body, '맞힌 문제')).toHaveTextContent('7')
  })

  it('맞힌·틀린 수, 활동한 날, 난이도별 맞힌 수와 잔디 요약을 보여 준다', async () => {
    renderMyPage(EMAIL_USER)
    const activity = activityFor(1)

    // 숫자는 응답 뒤에 온다
    await screen.findByText('맞힌 문제')
    expect(statValue(document.body, '맞힌 문제')).toHaveTextContent('7')
    expect(statValue(document.body, '틀린 문제')).toHaveTextContent('3')
    expect(statValue(document.body, '활동한 날')).toHaveTextContent(
      String(activity.totalActiveDays),
    )

    const grass = screen.getByRole('region', { name: '활동 기록' })
    expect(
      within(grass).getByText(new RegExp(`최근 12개월 중.*총 ${activity.totalActiveDays}일`)),
    ).toBeInTheDocument()
    expect(
      within(grass).getByRole('img', {
        name: `최근 1년 동안 ${activity.totalActiveDays}일 제출했어요`,
      }),
    ).toBeInTheDocument()

    // 난이도 막대의 기준은 맞힌 문제 전체(7)다
    const byDifficulty = screen.getByRole('region', { name: '난이도별 맞힌 문제' })
    const bars = within(byDifficulty).getAllByRole('progressbar')
    expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual(['쉬움', '보통', '어려움'])
    expect(bars.map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['4', '2', '1'])
    expect(bars.every((bar) => bar.getAttribute('aria-valuemax') === '7')).toBe(true)
    // 명세 MY-05: 내 학습·제출 기록으로 가는 길
    expect(within(byDifficulty).getByRole('link', { name: /학습 리포트 보기/ })).toHaveAttribute(
      'href',
      '/me/report',
    )
    expect(within(byDifficulty).getByRole('link', { name: /제출 기록 보기/ })).toHaveAttribute(
      'href',
      '/submissions',
    )
  })

  it('제출이 없으면 숫자는 0이고 안내 문구를 띄운다', async () => {
    renderMyPage(EMAIL_USER, 2)
    expect(await screen.findByText('아직 제출한 문제가 없어요.')).toBeInTheDocument()
    expect(statValue(document.body, '맞힌 문제')).toHaveTextContent('0')
    expect(screen.getByRole('img', { name: '최근 1년 동안 0일 제출했어요' })).toBeInTheDocument()
  })

  it('불러오지 못하면 오류와 다시 시도를 보여 준다', async () => {
    renderMyPage(EMAIL_USER, 'error')
    expect(await screen.findByRole('button', { name: /다시/ })).toBeInTheDocument()
  })
})
