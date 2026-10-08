import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

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
    expect(screen.getByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문제 목록으로' })).toHaveAttribute('href', '/problems')
  })
})

describe('ForbiddenPage', () => {
  it('403과 안내, 돌아갈 링크를 보여 준다', () => {
    render(
      <MemoryRouter>
        <ForbiddenPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('403')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '권한이 없습니다' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문제 목록으로' })).toHaveAttribute('href', '/problems')
  })
})
