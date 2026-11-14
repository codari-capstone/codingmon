import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from './queryClient'
import { AppShell } from './AppShell'
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

describe('AppShell 바탕', () => {
  it('화면이 handle로 subtle을 고르면 옅은 바탕이다', async () => {
    renderAt('/subtle')
    const shell = (await screen.findByRole('heading', { name: '옅은 바탕' })).closest(
      'main',
    )!.parentElement!
    expect(shell).toHaveClass('bg-muted')
    expect(shell).not.toHaveClass('bg-background')
  })

  it('고르지 않으면 기본 바탕이다', async () => {
    renderAt('/plain')
    const shell = (await screen.findByRole('heading', { name: '보통' })).closest(
      'main',
    )!.parentElement!
    expect(shell).toHaveClass('bg-background')
  })
})

describe('AppShell 페이지 폭 (bleed)', () => {
  it('handle bleed면 본문을 페이지 폭에 가두지 않는다', async () => {
    renderAt('/bleed')
    const main = (await screen.findByRole('heading', { name: '끝까지' })).closest('main')!
    expect(main).not.toHaveClass('max-w-content')
  })

  it('bleed 화면에서 오류가 나면 오류 화면은 페이지 폭에 가둔다', async () => {
    renderAt('/bleed-broken')
    const main = (await screen.findByRole('heading', { level: 1 })).closest('main')!
    expect(main).toHaveClass('max-w-content')
  })
})
