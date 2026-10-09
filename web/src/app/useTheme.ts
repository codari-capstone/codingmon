import { createContext, useContext } from 'react'

import type { Theme } from './theme'

export interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
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
