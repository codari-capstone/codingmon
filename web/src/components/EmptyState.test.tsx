import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('제목과 설명을 보여 준다', () => {
    render(
      <MemoryRouter>
        <EmptyState title="제출 기록이 없습니다" description="쉬움 난이도부터 풀어 보세요." />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: '제출 기록이 없습니다' })).toBeInTheDocument()
    expect(screen.getByText('쉬움 난이도부터 풀어 보세요.')).toBeInTheDocument()
  })

  it('action을 주면 링크를 보여 준다', () => {
    render(
      <MemoryRouter>
        <EmptyState
          title="제출 기록이 없습니다"
          description="쉬움 난이도부터 풀어 보세요."
          action={{ label: '문제 고르기', to: '/problems' }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: '문제 고르기' })).toHaveAttribute('href', '/problems')
  })

  it('action이 없으면 링크가 없다', () => {
    render(
      <MemoryRouter>
        <EmptyState title="결과가 없습니다" description="조건을 바꿔 보세요." />
      </MemoryRouter>,
    )

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
