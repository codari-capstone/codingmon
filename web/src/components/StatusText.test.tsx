import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusText } from './StatusText'

describe('StatusText', () => {
  it('글자로 상태를 알리고 아이콘은 화면 낭독기에서 숨긴다', () => {
    const { container } = render(<StatusText tone="danger">틀렸습니다</StatusText>)

    expect(screen.getByText('틀렸습니다')).toHaveClass('text-destructive-text')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('판정 색은 채움 색이 아니라 글자용 토큰을 쓴다', () => {
    render(<StatusText tone="warning">시간 초과</StatusText>)

    // 채움 색(text-warning)은 밝은 모드 흰 카드 위에서 1.88:1이라 글자로 쓰지 않는다
    expect(screen.getByText('시간 초과')).toHaveClass('text-warning-text')
  })

  it('판정이 없는 상태(muted)는 아이콘 없이 보조 글자로 보여 준다', () => {
    const { container } = render(<StatusText tone="muted">안 품</StatusText>)

    expect(screen.getByText('안 품')).toHaveClass('text-muted-foreground')
    expect(container.querySelector('svg')).toBeNull()
  })
})
