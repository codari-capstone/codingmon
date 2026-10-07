import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'

import { AppHeader } from './AppHeader'
import { ThemeProvider } from './ThemeProvider'

function renderHeader() {
  return render(
    <ThemeProvider>
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('AppHeader', () => {
  it('로고와 메뉴 3개를 보여 준다', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: 'Codari' })).toHaveAttribute('href', '/problems')
    expect(screen.getByRole('link', { name: '문제' })).toHaveAttribute('href', '/problems')
    expect(screen.getByRole('link', { name: '제출 기록' })).toHaveAttribute('href', '/submissions')
    expect(screen.getByRole('link', { name: '내 학습' })).toHaveAttribute('href', '/me/report')
  })

  it('테마 전환 버튼이 있다', () => {
    renderHeader()
    expect(screen.getByRole('button', { name: '다크 모드로 전환' })).toBeInTheDocument()
  })

  // useAuth가 지금은 비로그인 고정이므로 로그인 링크가 나와야 한다 (#18에서 바뀐다)
  it('비로그인이면 로그인 링크를 보여 준다', () => {
    renderHeader()

    expect(screen.getByRole('link', { name: '로그인' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /사용자 메뉴/ })).not.toBeInTheDocument()
  })
})
