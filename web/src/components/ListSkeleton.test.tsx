import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ListSkeleton } from './ListSkeleton'

describe('ListSkeleton', () => {
  it('기본 5줄을 그린다', () => {
    render(<ListSkeleton />)
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(5)
  })

  it('rows로 줄 수를 정한다', () => {
    render(<ListSkeleton rows={3} />)
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3)
  })

  // 스크린 리더에 빈 네모가 읽히면 안 되고, 기다리는 중이라고 알려야 한다.
  // aria-label은 "이름"만 만든다. 라이브 영역이 실제로 읽히려면 영역 안에 텍스트가
  // 있어야 하므로, 이름이 아니라 내용을 단언한다.
  it('기다리는 중임을 라이브 영역 안의 텍스트로 알린다', () => {
    render(<ListSkeleton />)
    const region = screen.getByRole('status')

    expect(region).toHaveTextContent('불러오는 중')
    expect(region).toHaveAttribute('aria-live', 'polite')
  })

  it('네모는 스크린 리더에 읽히지 않는다', () => {
    render(<ListSkeleton rows={2} />)

    for (const row of screen.getAllByTestId('skeleton-row')) {
      expect(row).toHaveAttribute('aria-hidden', 'true')
    }
  })
})
