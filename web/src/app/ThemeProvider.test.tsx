import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { THEME_STORAGE_KEY } from './theme'
import { ThemeProvider } from './ThemeProvider'
import { useTheme } from './useTheme'

function Probe() {
  const { theme, toggle } = useTheme()
  return (
    <button type="button" onClick={toggle}>
      {theme}
    </button>
  )
}

/**
 * OS 설정 변경을 실제로 흉내내려면 change 리스너를 붙잡아 둘 수 있어야 한다.
 * setup.ts의 기본 스텁은 addEventListener가 빈 함수라 이벤트를 쏠 수 없다.
 */
function stubMatchMedia(initialDark: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  let matches = initialDark

  const original = window.matchMedia
  window.matchMedia = ((query: string) =>
    ({
      get matches() {
        return matches
      },
      media: query,
      onchange: null,
      addEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => {
        listeners.add(fn)
      },
      removeEventListener: (_: string, fn: (event: MediaQueryListEvent) => void) => {
        listeners.delete(fn)
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList) as typeof window.matchMedia

  return {
    /** OS 설정이 바뀐 것처럼 만든다. */
    changeTo(dark: boolean) {
      matches = dark
      act(() => {
        for (const fn of listeners) fn({ matches: dark } as MediaQueryListEvent)
      })
    },
    listenerCount: () => listeners.size,
    restore: () => {
      window.matchMedia = original
    },
  }
}

describe('ThemeProvider', () => {
  let media: ReturnType<typeof stubMatchMedia> | null = null

  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
  })

  afterEach(() => {
    media?.restore()
    media = null
  })

  it('기본값은 라이트이고 html에 dark 클래스가 없다', () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('토글하면 테마가 바뀌고 localStorage에 저장된다', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button'))

    expect(screen.getByRole('button')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('저장된 값이 있으면 그 테마로 시작한다', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  // 저장된 값이 없으면 OS를 계속 따라야 한다. 첫 로드만 따르고 멈추면
  // 사용자가 OS를 다크로 바꿨는데 앱만 라이트로 남는다.
  it('저장된 값이 없으면 OS 설정 변경을 따라간다', () => {
    media = stubMatchMedia(false)
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button')).toHaveTextContent('light')

    media.changeTo(true)

    expect(screen.getByRole('button')).toHaveTextContent('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('사용자가 고른 테마는 OS 설정 변경보다 우선한다', async () => {
    media = stubMatchMedia(false)
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('dark')

    // OS가 라이트로 바뀌어도 사용자가 고른 다크를 유지한다
    media.changeTo(false)

    expect(screen.getByRole('button')).toHaveTextContent('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })

  it('언마운트하면 OS 설정 리스너를 떼어낸다', () => {
    media = stubMatchMedia(false)
    const { unmount } = render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    )
    expect(media.listenerCount()).toBe(1)

    unmount()

    expect(media.listenerCount()).toBe(0)
  })
})
