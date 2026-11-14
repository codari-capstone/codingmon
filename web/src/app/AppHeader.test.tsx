import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { server } from '@/mocks/server'
import * as useAuthModule from '@/features/auth/useAuth'
import { AppHeader } from './AppHeader'
import { ThemeProvider } from './ThemeProvider'

// vite.config.ts에 restoreMocks가 없다. 파일마다 직접 되돌린다.
afterEach(() => vi.restoreAllMocks())

function mockAuth(state: Partial<ReturnType<typeof useAuthModule.useAuth>>) {
  vi.spyOn(useAuthModule, 'useAuth').mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    ...state,
  })
}

function renderHeader() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <MemoryRouter>
          <AppHeader />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

/** 로그인 링크가 어떤 state를 싣는지 보려면 실제로 이동시켜 봐야 한다. */
function renderHeaderAt(url: string | { pathname: string; state: unknown }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // path를 '*'로 두면 /login으로 이동해도 같은 헤더가 그려져, 라우트를 더 두지 않아도 된다.
  const router = createMemoryRouter([{ path: '*', element: <AppHeader /> }], {
    initialEntries: [url],
  })

  render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  )

  return router
}

describe('AppHeader', () => {
  it('로고와 메뉴 3개를 보여 준다', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'Codingmon' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: '문제' })).toHaveAttribute('href', '/problems')
    expect(screen.getByRole('link', { name: '제출 기록' })).toHaveAttribute('href', '/submissions')
    expect(screen.getByRole('link', { name: '내 학습' })).toHaveAttribute('href', '/me/report')
  })

  it('배지 화면에서도 내 학습 메뉴가 켜져 있다 (BADGE-02)', () => {
    renderHeaderAt('/me/badges')
    const nav = screen.getByRole('navigation', { name: '주요 메뉴' })
    expect(within(nav).getByRole('link', { name: '내 학습' })).toHaveClass('bg-muted')
    expect(within(nav).getByRole('link', { name: '문제' })).not.toHaveClass('bg-muted')
  })

  it('테마 전환 버튼이 있다', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: '다크 모드로 전환' })).toBeInTheDocument()
  })

  it('비로그인이면 로그인 링크를 보여 준다', () => {
    mockAuth({})
    renderHeader()

    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '무료로 시작하기' })).toHaveAttribute('href', '/signup')
    expect(screen.queryByRole('button', { name: /사용자 메뉴/ })).not.toBeInTheDocument()
  })

  it('세션을 모르는 동안에는 로그인 버튼도 사용자 메뉴도 보이지 않는다', () => {
    mockAuth({ isLoading: true })
    renderHeader()

    expect(screen.queryByRole('link', { name: '로그인' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /사용자 메뉴/ })).not.toBeInTheDocument()
  })

  it('세션을 모르는 동안에는 버튼 자리만큼 빈 칸을 잡아 둔다', () => {
    mockAuth({ isLoading: true })
    const { container } = renderHeader()

    // jsdom에는 레이아웃이 없어 크기를 잴 수 없다. 자리 잡는 요소의 클래스로 확인한다.
    expect(container.querySelector('[aria-hidden="true"].h-control-sm.w-24')).toBeInTheDocument()
  })

  it('로그인 링크에 지금 주소를 실어 보낸다 (COM-07)', async () => {
    // 싣지 않으면 로그인 뒤 기본 목적지로 가서 보고 있던 검색·필터가 사라진다.
    mockAuth({})
    const user = userEvent.setup()
    const router = renderHeaderAt('/problems?difficulty=EASY&keyword=sum')

    await user.click(screen.getByRole('link', { name: '로그인' }))

    expect(router.state.location.pathname).toBe('/login')
    expect(router.state.location.state).toEqual({
      from: '/problems?difficulty=EASY&keyword=sum',
    })
  })

  it('가입 링크도 돌아갈 주소를 싣는다', async () => {
    // 가입 화면은 받은 from을 로그인 화면으로 넘긴다. 없으면 가입·로그인 뒤 기본 목적지로 간다
    mockAuth({})
    const user = userEvent.setup()
    const router = renderHeaderAt('/problems/42')

    await user.click(screen.getByRole('link', { name: '무료로 시작하기' }))

    expect(router.state.location.pathname).toBe('/signup')
    expect(router.state.location.state).toEqual({ from: '/problems/42' })
  })

  it('로그인 화면에서 누르면 그 화면이 들고 있던 돌아갈 주소를 이어 준다', async () => {
    // 지금 주소(/login)를 실으면 safeRedirect가 버려 원래 보던 /problems/42를 잃는다
    mockAuth({})
    const user = userEvent.setup()
    const router = renderHeaderAt({ pathname: '/login', state: { from: '/problems/42' } })

    await user.click(screen.getByRole('link', { name: '무료로 시작하기' }))

    expect(router.state.location.state).toEqual({ from: '/problems/42' })
  })

  it('USER에게는 관리자 링크를 보여 주지 않는다', () => {
    mockAuth({
      user: {
        id: 1,
        nickname: '코다리',
        role: 'USER',
        email: 'us***@codari.test',
        loginMethod: 'EMAIL',
        githubUsername: null,
      },
      isAuthenticated: true,
    })
    renderHeader()

    expect(screen.getByRole('button', { name: /사용자 메뉴/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '관리자' })).not.toBeInTheDocument()
  })

  it('ADMIN에게만 관리자 링크를 보여 준다 (COM-05)', () => {
    mockAuth({
      user: {
        id: 2,
        nickname: '관리자',
        role: 'ADMIN',
        email: 'ad***@codari.test',
        loginMethod: 'EMAIL',
        githubUsername: null,
      },
      isAuthenticated: true,
    })
    renderHeader()

    expect(screen.getByRole('link', { name: '관리자' })).toHaveAttribute('href', '/admin')
  })

  it('관리자 화면에서 세션을 모르는 동안에도 관리자 메뉴를 둔다', () => {
    // 학습자 메뉴를 먼저 보였다가 바꾸면 새로고침마다 메뉴가 3개 -> 1개로 흔들린다
    mockAuth({ isLoading: true })
    renderHeaderAt('/admin')

    const nav = screen.getByRole('navigation', { name: '주요 메뉴' })
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['문제'])
  })

  it('관리자 화면에서는 관리자 메뉴로 바뀐다 (ADM-10)', () => {
    mockAuth({
      user: {
        id: 2,
        nickname: '관리자',
        role: 'ADMIN',
        email: 'ad***@codari.test',
        loginMethod: 'EMAIL',
        githubUsername: null,
      },
      isAuthenticated: true,
    })
    renderHeaderAt('/admin/problems/3')

    const nav = screen.getByRole('navigation', { name: '주요 메뉴' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['문제'])
    expect(links[0]).toHaveAttribute('href', '/admin')
  })

  it('비로그인에게도 제출 기록·내 학습 링크는 보인다', () => {
    // COM-05가 숨기라고 한 것은 관리자 메뉴뿐이다. 누르면 로그인으로 갔다가 돌아온다.
    mockAuth({})
    renderHeader()

    expect(screen.getByRole('link', { name: '제출 기록' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '내 학습' })).toBeInTheDocument()
  })

  it('사용자 메뉴는 마이페이지·내 학습·로그아웃 순이다 (COM-01)', async () => {
    mockAuth({
      user: {
        id: 1,
        nickname: '코다리',
        role: 'USER',
        email: 'us***@codari.test',
        loginMethod: 'EMAIL',
        githubUsername: null,
      },
      isAuthenticated: true,
    })
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    const items = await screen.findAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual(['마이페이지', '내 학습', '로그아웃'])
    expect(items[0]).toHaveAttribute('href', '/me')
  })

  it('사용자 메뉴의 로그아웃을 고르면 로그아웃을 요청한다 (COM-03)', async () => {
    let requested = false
    server.use(
      http.post('*/api/auth/logout', () => {
        requested = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    mockAuth({
      user: {
        id: 1,
        nickname: '코다리',
        role: 'USER',
        email: 'us***@codari.test',
        loginMethod: 'EMAIL',
        githubUsername: null,
      },
      isAuthenticated: true,
    })
    const user = userEvent.setup()
    renderHeader()

    await user.click(screen.getByRole('button', { name: /사용자 메뉴/ }))
    await user.click(await screen.findByRole('menuitem', { name: '로그아웃' }))

    await vi.waitFor(() => expect(requested).toBe(true))
  })
})
