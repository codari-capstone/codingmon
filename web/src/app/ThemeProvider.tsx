import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

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

  /**
   * 이 방문에서 사용자가 테마를 직접 골랐는지. localStorage와 따로 기억한다.
   *
   * storeTheme은 저장 실패를 삼키므로(사생활 보호 모드·사이트 데이터 차단),
   * 저장 여부만으로 판단하면 사용자가 토글을 눌러도 readStoredTheme()이 계속
   * null이고, 그 뒤 OS가 바뀌면 고른 테마가 덮인다. 메모리 상태로 기억하면
   * 저장 성공 여부와 무관해진다.
   */
  const chosenByUser = useRef(readStoredTheme() !== null)

  // commit 뒤 paint 전에 동기로 클래스를 붙인다. 다만 이것은 React가 렌더를
  // 시작한 뒤의 깜빡임만 막는다. 번들 로드 전 구간은 index.html의 인라인
  // 스크립트가 맡는다 — 둘 중 하나라도 빠지면 깜빡임이 보인다.
  useLayoutEffect(() => {
    applyTheme(theme)
  }, [theme])

  // 사용자가 고른 적이 없으면 OS 설정을 계속 따라간다. 첫 로드만 따르고 그 뒤
  // OS가 바뀌어도 그대로 두면 사용자는 앱이 고장난 것으로 본다.
  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY)
    const onChange = (event: MediaQueryListEvent) => {
      if (!chosenByUser.current) {
        setThemeState(event.matches ? 'dark' : 'light')
      }
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const setTheme = useCallback((next: Theme) => {
    chosenByUser.current = true
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
