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

  // 화면 일부가 비었을 때가 기본이라 h2여야 한다. 그 화면의 h1은 따로 있다.
  it('기본 제목은 h2다', () => {
    render(
      <MemoryRouter>
        <EmptyState title="결과가 없습니다" description="조건을 바꿔 보세요." />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 2, name: '결과가 없습니다' })).toBeInTheDocument()
  })

  // 화면 전체가 빈 상태면 이 제목이 h1이어야 한다. 아니면 h1 없는 화면이 된다.
  it('headingLevel 1이면 제목이 h1이 된다', () => {
    render(
      <MemoryRouter>
        <EmptyState title="결과가 없습니다" description="조건을 바꿔 보세요." headingLevel={1} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { level: 1, name: '결과가 없습니다' })).toBeInTheDocument()
  })
})
