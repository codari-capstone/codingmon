import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from './queryClient'
import { AppShell } from './AppShell'
import { DEFAULT_TITLE } from './PageHead'
import { RouteErrorBoundary } from './RouteErrorBoundary'
import { ThemeProvider } from './ThemeProvider'

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: (
          <AppShell>
            <Outlet />
          </AppShell>
        ),
        children: [
          { path: '/plain', element: <h1>보통</h1> },
          { path: '/subtle', element: <h1>옅은 바탕</h1>, handle: { pageTone: 'subtle' } },
          { path: '/bleed', element: <h1>끝까지</h1>, handle: { bleed: true } },
          { path: '/wide', element: <h1>넓게</h1>, handle: { wide: true } },
          { path: '/no-footer', element: <h1>바닥글 없음</h1>, handle: { noFooter: true } },
        ],
      },
      // 청크 로드 실패처럼 라우트가 던지면 RouteErrorBoundary가 AppShell로 감싼다(router.tsx와 같은 구조)
      {
        path: '/bleed-broken',
        handle: { bleed: true },
        loader: () => {
          throw new Error('청크를 받지 못함')
        },
        element: null,
        ErrorBoundary: RouteErrorBoundary,
      },
    ],
    { initialEntries: [path] },
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

/** 바탕을 칠하는 맨 바깥 틀. 상단 바·본문·바닥글을 세로로 쌓는다 */
const shellOf = (el: HTMLElement) => el.closest('main')!.closest<HTMLElement>('.min-h-dvh')!

describe('AppShell 바탕', () => {
  it('화면이 handle로 subtle을 고르면 옅은 바탕이다', async () => {
    renderAt('/subtle')
    const shell = shellOf(await screen.findByRole('heading', { name: '옅은 바탕' }))
    expect(shell).toHaveClass('bg-muted')
    expect(shell).not.toHaveClass('bg-background')
  })

  it('고르지 않으면 기본 바탕이다', async () => {
    renderAt('/plain')
    const shell = shellOf(await screen.findByRole('heading', { name: '보통' }))
    expect(shell).toHaveClass('bg-background')
  })
})

describe('AppShell 바닥글 (#335)', () => {
  it('모든 화면 맨 아래에 바닥글을 둔다', async () => {
    renderAt('/plain')
    const heading = await screen.findByRole('heading', { name: '보통' })
    const footer = screen.getByRole('contentinfo')
    expect(footer).toBe(shellOf(heading).lastElementChild)
    expect(within(footer).getByRole('link', { name: '개인정보 처리방침' })).toBeInTheDocument()
  })

  it('handle noFooter면 바닥글을 두지 않는다 (로그인·문제 풀이)', async () => {
    renderAt('/no-footer')
    await screen.findByRole('heading', { name: '바닥글 없음' })
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument()
  })

  it('오류 화면에는 바닥글을 둔다', async () => {
    renderAt('/bleed-broken')
    await screen.findByRole('heading', { level: 1 })
    expect(screen.getByRole('contentinfo')).toBeInTheDocument()
  })

  // PageHead까지 대체되므로 이전 화면의 제목이 남지 않는다(#326 리뷰). 일시적 실패에 공개 주소가 색인에서 빠지지 않게 noindex는 없다(#352 리뷰)
  it('라우트 오류 화면은 기본 제목으로 돌린다', async () => {
    document.title = '마이페이지 | Codingmon'
    renderAt('/bleed-broken')
    await screen.findByRole('heading', { level: 1 })
    // 제목은 그린 뒤 효과(useEffect)로 되돌린다. 오류 화면은 비동기로 그려져 h1이 먼저 보일 수 있다(CI에서 흔들렸다)
    await waitFor(() => expect(document.title).toBe(DEFAULT_TITLE))
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull()
  })
})

describe('AppShell 페이지 폭 (bleed)', () => {
  it('handle bleed면 본문을 페이지 폭에 가두지 않는다', async () => {
    renderAt('/bleed')
    const main = (await screen.findByRole('heading', { name: '끝까지' })).closest('main')!
    expect(main).not.toHaveClass('max-w-content')
  })

  it('handle wide면 1200px 대신 넓은 폭(1600px)에 둔다 (#327)', async () => {
    renderAt('/wide')
    const main = (await screen.findByRole('heading', { name: '넓게' })).closest('main')!
    expect(main).toHaveClass('max-w-wide')
    expect(main).not.toHaveClass('max-w-content')
    // 상단 바도 같은 폭이라 로고와 본문 왼쪽 끝이 맞는다
    expect(screen.getByRole('banner').firstElementChild).toHaveClass('max-w-wide')
  })

  it('bleed 화면에서 오류가 나면 오류 화면은 페이지 폭에 가둔다', async () => {
    renderAt('/bleed-broken')
    const main = (await screen.findByRole('heading', { level: 1 })).closest('main')!
    expect(main).toHaveClass('max-w-content')
  })
})
