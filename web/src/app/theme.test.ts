import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyTheme,
  readStoredTheme,
  resolveInitialTheme,
  storeTheme,
  THEME_STORAGE_KEY,
} from './theme'

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

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 사생활 보호 모드 등에서 localStorage 접근 자체가 던지는 경우의 폴백
  it('localStorage 접근이 던지면 null로 본다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(readStoredTheme()).toBeNull()
  })
})

describe('storeTheme', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // 저장이 막혀도(사생활 보호 모드 등) 화면은 계속 동작해야 한다
  it('localStorage 접근이 던져도 예외를 전파하지 않는다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => storeTheme('dark')).not.toThrow()
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
