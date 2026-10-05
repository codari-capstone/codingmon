import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { Component as NotFoundPage } from '@/app/NotFoundPage'
import { Component as ProblemListPage } from '@/features/problems/ProblemListPage'

/**
 * 개발환경이 제대로 묶였는지 확인하는 스모크 테스트.
 * 기능 테스트는 각 features/ 폴더에 담당자가 추가한다.
 */
describe('개발환경', () => {
  it('@/ 경로 별칭으로 컴포넌트를 불러와 렌더링한다', () => {
    render(<ProblemListPage />)
    expect(screen.getByRole('heading', { name: '문제 목록' })).toBeInTheDocument()
  })

  it('React Router 컨텍스트에서 링크를 렌더링한다', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: '문제 목록으로 가기' })).toHaveAttribute(
      'href',
      '/problems',
    )
  })

  it('QueryClient에 프로젝트 기본값이 적용된다', () => {
    const { queries } = createQueryClient().getDefaultOptions()
    expect(queries?.staleTime).toBe(30_000)
    expect(queries?.refetchOnWindowFocus).toBe(false)
  })
})
