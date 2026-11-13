import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import type { CurrentUser } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { THEME_STORAGE_KEY } from '@/app/theme'
import { ThemeProvider } from '@/app/ThemeProvider'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { EDITOR_SETTINGS_KEY } from '@/features/solve/editorSettings'
import { activityFor } from '@/mocks/fixtures/activity'
import { server } from '@/mocks/server'
import { Component as MyAccountPage } from './MyAccountPage'
import { Component as MyDisplayPage } from './MyDisplayPage'
import { Component as MyWithdrawPage } from './MyWithdrawPage'

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
  ...EMAIL_USER,
  id: 3,
  email: null,
  loginMethod: 'GITHUB',
  githubUsername: 'octo-kim',
}

function renderAt(path: string, user: CurrentUser = EMAIL_USER) {
  server.use(http.get('*/api/users/me/activity', () => HttpResponse.json(activityFor(1))))
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, user)
  const router = createMemoryRouter(
    [
      { path: '/me', element: <h1>마이페이지 도착</h1> },
      { path: '/me/account', Component: MyAccountPage },
      { path: '/me/display', Component: MyDisplayPage },
      { path: '/me/withdraw', Component: MyWithdrawPage },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  )
  return router
}

describe('계정 설정 /me/account (MY-01~03)', () => {
  it('프로필·비밀번호·로그인 방법 카드가 있고, 메뉴는 이 화면을 표시한다', async () => {
    renderAt('/me/account')
    expect(await screen.findByRole('heading', { level: 1, name: '계정 설정' })).toBeInTheDocument()
    expect(screen.getByLabelText('닉네임')).toBeInTheDocument()
    // 가린 이메일을 바꿀 수 없는 칸으로 보여 준다
    expect(screen.getByLabelText('이메일')).toHaveValue('us***@codari.test')
    expect(screen.getByLabelText('이메일')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('현재 비밀번호')).toBeInTheDocument()

    const login = screen.getByRole('region', { name: '로그인 방법' })
    expect(within(login).getByText('이메일과 비밀번호')).toBeInTheDocument()
    expect(within(login).getByText('연결됨')).toBeInTheDocument()

    const nav = screen.getByRole('navigation', { name: '마이페이지 메뉴' })
    expect(within(nav).getByRole('link', { name: /계정 설정/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('GitHub 가입자는 이메일 칸이 없고 로그인 방법에 GitHub 아이디가 보인다', async () => {
    renderAt('/me/account', GITHUB_USER)
    const login = await screen.findByRole('region', { name: '로그인 방법' })
    expect(within(login).getByText('GitHub')).toBeInTheDocument()
    expect(within(login).getByText('octo-kim')).toBeInTheDocument()
    expect(screen.queryByLabelText('이메일')).not.toBeInTheDocument()
  })
})

describe('화면 설정 /me/display (UX-06)', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  it('테마를 고르면 바로 적용되고, 시스템을 고르면 저장한 선택을 지운다', async () => {
    const user = userEvent.setup()
    renderAt('/me/display')

    // 고른 적이 없으면 '시스템'이 골라져 있다
    expect(await screen.findByRole('radio', { name: /시스템 설정 따르기/ })).toBeChecked()

    await user.click(screen.getByRole('radio', { name: /다크/ }))
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    await user.click(screen.getByRole('radio', { name: /시스템 설정 따르기/ }))
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    // 테스트 환경의 OS 설정은 라이트다(setup.ts)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('코드 에디터 설정(UX-07)은 기본값에서 시작하고, 바꾸면 이 기기에 저장되고 미리 보기에 바로 적용된다', async () => {
    const user = userEvent.setup()
    renderAt('/me/display')

    const fontSize = await screen.findByLabelText('글꼴 크기')
    expect(screen.getByLabelText('기본 언어')).toHaveValue('PYTHON')
    expect(fontSize).toHaveValue('14')
    expect(screen.getByLabelText('들여쓰기')).toHaveValue('4')
    expect(screen.getByRole('switch', { name: '줄 번호 보기' })).toBeChecked()
    expect(screen.getByRole('switch', { name: '괄호 자동으로 닫기' })).toBeChecked()
    expect(screen.getByRole('switch', { name: /긴 줄 자동 줄바꿈/ })).not.toBeChecked()

    await user.selectOptions(fontSize, '18')
    await user.selectOptions(screen.getByLabelText('기본 언어'), 'CPP')
    await user.click(screen.getByRole('switch', { name: '줄 번호 보기' }))

    expect(JSON.parse(localStorage.getItem(EDITOR_SETTINGS_KEY)!)).toMatchObject({
      fontSize: 18,
      language: 'CPP',
      lineNumbers: false,
    })
    const preview = screen.getByRole('textbox', { name: '설정 미리 보기' })
    // 글꼴 크기는 에디터를 감싼 요소의 style로 준다(CodeEditor)
    expect(preview.closest<HTMLElement>('[style*="font-size"]')?.style.fontSize).toBe('18px')
    expect(document.querySelector('.cm-lineNumbers')).toBeNull()
  })
})

describe('회원 탈퇴 /me/withdraw (MY-04)', () => {
  it('남은 기록과 지워지는 것을 알리고 확인 카드를 둔다', async () => {
    renderAt('/me/withdraw')
    const activity = activityFor(1)
    expect(
      await screen.findByText(
        new RegExp(
          `맞힌 문제가 ${activity.solvedCount}개, 최근 1년 동안 공부한 날이 ${activity.totalActiveDays}일`,
        ),
      ),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '지워지는 것' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/되돌릴 수 없어요/)
    expect(screen.getByRole('button', { name: '회원 탈퇴' })).toBeDisabled()
  })

  it('관리자가 주소로 들어오면 마이페이지로 돌려보낸다', async () => {
    const router = renderAt('/me/withdraw', { ...EMAIL_USER, role: 'ADMIN' })
    expect(await screen.findByRole('heading', { name: '마이페이지 도착' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/me')
  })
})
