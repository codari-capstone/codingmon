import { useSyncExternalStore } from 'react'

import type { Language } from '@/api/types'

/** 코드 에디터 설정 (UX-07). 이 브라우저에만 저장한다 — 테마(UX-06)와 같다. */
export interface EditorSettings {
  /** 주소에 언어가 없을 때 풀이 화면이 먼저 여는 언어 */
  language: Language
  fontSize: number
  /** 들여쓰기 공백 수. Tab 키와 자동 들여쓰기가 함께 따른다 */
  tabSize: number
  lineNumbers: boolean
  closeBrackets: boolean
  lineWrapping: boolean
}

/** 화면 설정의 고르는 칸과 저장값 검증이 같은 목록을 쓴다. 한쪽만 늘면 고른 값이 곧바로 되돌아간다 */
export const EDITOR_LANGUAGES = ['PYTHON', 'CPP'] as const satisfies readonly Language[]
export const FONT_SIZES = [13, 14, 16, 18] as const
export const TAB_SIZES = [2, 4] as const

export const EDITOR_DEFAULTS: EditorSettings = {
  language: 'PYTHON',
  fontSize: 14,
  tabSize: 4,
  lineNumbers: true,
  closeBrackets: true,
  lineWrapping: false,
}

export const EDITOR_SETTINGS_KEY = 'codari-editor'

const pick = <T>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback

/** 저장된 값은 손으로 고칠 수 있다. 칸마다 아는 값만 받고 나머지는 기본값으로 둔다. */
export function parseEditorSettings(raw: string | null): EditorSettings {
  let saved: Record<string, unknown> = {}
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object') saved = parsed as Record<string, unknown>
  } catch {
    // 깨진 값이면 기본값으로 연다
  }
  const d = EDITOR_DEFAULTS
  const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
  return {
    language: pick<Language>(saved.language, EDITOR_LANGUAGES, d.language),
    fontSize: pick<number>(saved.fontSize, FONT_SIZES, d.fontSize),
    tabSize: pick<number>(saved.tabSize, TAB_SIZES, d.tabSize),
    lineNumbers: bool(saved.lineNumbers, d.lineNumbers),
    closeBrackets: bool(saved.closeBrackets, d.closeBrackets),
    lineWrapping: bool(saved.lineWrapping, d.lineWrapping),
  }
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(EDITOR_SETTINGS_KEY)
  } catch {
    return null // 사생활 보호 모드에서는 접근 자체가 던진다
  }
}

/*
  메모리에 한 벌 두고 바뀔 때만 갈아끼운다. useSyncExternalStore는 렌더마다 스냅샷을 묻는데,
  그때마다 localStorage를 읽으면 키를 칠 때마다 읽게 되고, 다른 탭에서 바꾼 값이 알림 없이
  다음 입력에 끼어든다. 다른 탭의 변경은 storage 이벤트로 받는다.
  저장이 막힌 브라우저에서도 이번 방문에는 바꾼 값이 이 메모리로 적용된다.
*/
let current: EditorSettings | undefined
const listeners = new Set<() => void>()

/** 지금 설정. 훅 밖에서 한 번만 읽을 때 쓴다(풀이 화면의 처음 여는 언어). */
export function getEditorSettings(): EditorSettings {
  current ??= parseEditorSettings(readRaw())
  return current
}

function notify() {
  listeners.forEach((listener) => listener())
}

function onStorage(event: StorageEvent) {
  // key가 null이면 다른 탭이 저장소를 통째로 비운 것이다
  if (event.key !== null && event.key !== EDITOR_SETTINGS_KEY) return
  current = parseEditorSettings(readRaw())
  notify()
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) window.addEventListener('storage', onStorage)
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener('storage', onStorage)
  }
}

export function updateEditorSettings(patch: Partial<EditorSettings>): void {
  current = { ...getEditorSettings(), ...patch }
  try {
    localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(current))
  } catch {
    // 저장이 막혔으면 이번 방문에만 적용된다
  }
  notify()
}

/** 화면 설정에서 바꾸면 열려 있는 에디터에 바로 적용된다. */
export function useEditorSettings(): EditorSettings {
  return useSyncExternalStore(subscribe, getEditorSettings)
}
