import { beforeEach, describe, expect, it } from 'vitest'

import { applyTheme, readStoredTheme, resolveInitialTheme, THEME_STORAGE_KEY } from './theme'

describe('resolveInitialTheme', () => {
  it('저장된 값이 있으면 그것을 쓴다', () => {
    expect(resolveInitialTheme('dark', false)).toBe('dark')
    expect(resolveInitialTheme('light', true)).toBe('light')
  })

  it('저장된 값이 없으면 OS 설정을 따른다', () => {
    expect(resolveInitialTheme(null, true)).toBe('dark')
    expect(resolveInitialTheme(null, false)).toBe('light')
  })
})

describe('readStoredTheme', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('저장된 값이 없으면 null', () => {
    expect(readStoredTheme()).toBeNull()
  })

  it('light·dark만 받아들인다', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    expect(readStoredTheme()).toBe('dark')
  })

  // 사용자가 직접 고친 값이나 옛 버전이 남긴 값이 들어와도 깨지지 않아야 한다
  it('모르는 값은 null로 본다', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'solarized')
    expect(readStoredTheme()).toBeNull()
  })
})

describe('applyTheme', () => {
  it('dark면 html에 dark 클래스를 붙이고 light면 뗀다', () => {
    applyTheme('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    applyTheme('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
