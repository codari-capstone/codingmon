import { createContext, useContext } from 'react'

import type { Theme } from './theme'

/** 사용자가 고른 것. 'system'은 고르지 않고 OS 설정을 따르는 상태다. */
export type ThemePreference = Theme | 'system'

export interface ThemeContextValue {
  /** 지금 화면에 적용된 테마 */
  theme: Theme
  preference: ThemePreference
  setTheme: (theme: Theme) => void
  setPreference: (preference: ThemePreference) => void
  toggle: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (!value) {
    throw new Error('useTheme은 ThemeProvider 안에서만 쓸 수 있다')
  }
  return value
}
