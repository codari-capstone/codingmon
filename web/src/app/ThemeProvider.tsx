import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

import { applyTheme, readStoredTheme, resolveInitialTheme, storeTheme, type Theme } from './theme'
import { ThemeContext } from './useTheme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function prefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 첫 렌더부터 올바른 테마로 그리려고 초기화 함수에서 결정한다.
  const [theme, setThemeState] = useState<Theme>(() =>
    resolveInitialTheme(readStoredTheme(), prefersDark()),
  )

  // useLayoutEffect로 commit 뒤 paint 전에 동기로 클래스를 붙여 깜빡임을 없앤다.
  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  // 저장된 값이 없으면 OS 설정을 계속 따라간다. 첫 로드만 따르고 그 뒤 OS가 바뀌어도
  // 그대로 두면 사용자는 앱이 고장난 것으로 본다. 토글을 누르면 localStorage에 값이
  // 생기고, 그때부터는 사용자의 선택이 OS보다 우선한다.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      if (readStoredTheme() === null) {
        setThemeState(event.matches ? 'dark' : 'light')
      }
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    storeTheme(next)
    setThemeState(next)
  }, [])

  const toggle = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeContext.Provider>
  )
}
