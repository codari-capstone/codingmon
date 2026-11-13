import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from './queryClient'
import { AppShell } from './AppShell'
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
        ],
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
