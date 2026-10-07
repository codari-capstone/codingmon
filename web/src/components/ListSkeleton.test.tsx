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

  // 스크린 리더에 빈 네모가 읽히면 안 되고, 기다리는 중이라고 알려야 한다
  it('기다리는 중임을 알린다', () => {
    render(<ListSkeleton />)
    const region = screen.getByRole('status')
    expect(region).toHaveAccessibleName('불러오는 중')
  })
})
