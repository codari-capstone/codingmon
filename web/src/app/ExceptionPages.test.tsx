import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, MemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { Component as ForbiddenPage } from './ForbiddenPage'
import { Component as NotFoundPage } from './NotFoundPage'

describe('NotFoundPage', () => {
  it('404와 안내, 돌아갈 링크를 보여 준다', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('404')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '페이지를 찾을 수 없어요' })).toBeVisible()
    expect(screen.getByRole('link', { name: '문제 목록으로' })).toHaveAttribute('href', '/problems')
  })

  it('주소를 바로 열었으면 이전 페이지 버튼이 없다', () => {
    // 뒤로 가면 앱 밖으로 나간다
    render(
      <MemoryRouter initialEntries={['/nope']}>
        <NotFoundPage />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: '이전 페이지' })).not.toBeInTheDocument()
  })

  it('앱 안에서 왔으면 이전 페이지로 돌아간다', async () => {
    const router = createMemoryRouter(
      [
        { path: '/problems', element: <p>문제 목록</p> },
        { path: '*', element: <NotFoundPage /> },
      ],
      { initialEntries: ['/problems'] },
    )
    render(<RouterProvider router={router} />)
    await router.navigate('/nope')

    await userEvent.click(await screen.findByRole('button', { name: '이전 페이지' }))

    expect(await screen.findByText('문제 목록')).toBeInTheDocument()
  })
})

describe('ForbiddenPage', () => {
  function renderForbidden() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const router = createMemoryRouter(
      [
        { path: '/forbidden', element: <ForbiddenPage /> },
        { path: '/login', element: <p>로그인 화면</p> },
      ],
      { initialEntries: ['/forbidden'] },
    )
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )
    return router
  }

  it('403과 안내, 돌아갈 링크를 보여 준다', () => {
    renderForbidden()

    expect(screen.getByText('403')).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { level: 1, name: '이 화면을 볼 권한이 없어요' }),
    ).toBeVisible()
    expect(screen.getByRole('link', { name: '문제 목록으로' })).toHaveAttribute('href', '/problems')
  })

  it('다른 계정으로 로그인은 로그아웃한 뒤 로그인 화면으로 간다', async () => {
    // 로그인한 채로 /login에 가면 원래 화면으로 돌려보내져 다른 계정으로 들어갈 수 없다
    let loggedOut = false
    server.use(
      http.post('*/api/auth/logout', () => {
        loggedOut = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const router = renderForbidden()

    await userEvent.click(screen.getByRole('button', { name: '다른 계정으로 로그인' }))

    expect(await screen.findByText('로그인 화면')).toBeInTheDocument()
    expect(loggedOut).toBe(true)
    expect(router.state.location.pathname).toBe('/login')
  })
})
