import { useCallback, useLayoutEffect, useState } from 'react'

import { applyTheme, readStoredTheme, resolveInitialTheme, storeTheme, type Theme } from './theme'
import { ThemeContext } from './useTheme'

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
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
