export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'codari-theme'

function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark'
}

/**
 * 저장된 테마를 읽는다. 값이 없거나 아는 값이 아니면 null.
 * 사생활 보호 모드에서는 localStorage 접근 자체가 던질 수 있어 감싼다.
 */
export function readStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    return isTheme(raw) ? raw : null
  } catch {
    return null
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // 저장이 안 되면 이번 방문에만 적용된다. 화면은 그대로 동작한다.
  }
}

/** 저장한 선택을 지운다. 다음 방문부터 OS 설정을 따른다(화면 설정의 '시스템', UX-06). */
export function clearStoredTheme(): void {
  try {
    localStorage.removeItem(THEME_STORAGE_KEY)
  } catch {
    // 지우지 못하면 다음 방문에 지난 선택이 남는다. 이번 방문은 아래 상태가 맡는다.
  }
}

/** 저장된 값이 우선이고, 없으면 OS 설정을 따른다. */
export function resolveInitialTheme(stored: Theme | null, prefersDark: boolean): Theme {
  if (stored) return stored
  return prefersDark ? 'dark' : 'light'
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}
