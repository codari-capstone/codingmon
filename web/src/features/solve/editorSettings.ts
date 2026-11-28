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

  듣는 쪽이 하나도 없는 동안에는 storage 이벤트도 듣지 않는다. 그 사이 다른 탭이 바꾼 값을
  놓치므로, 그때는 읽을 때마다 저장소와 견준다(#280 리뷰) — 안 그러면 다시 열 때 낡은 값으로 열리고,
  그 위에 고친 칸 하나를 얹어 저장해 다른 탭의 변경을 되돌린다. 같은 문자열이면 같은 객체를 돌려준다
  (useSyncExternalStore는 스냅샷이 매번 새 객체면 무한히 다시 그린다).
*/
let current: EditorSettings | undefined
/** current를 만든 저장소 문자열. 저장이 막혀 메모리에만 바꾼 값은 이 문자열과 같아 덮이지 않는다 */
let currentRaw: string | null = null
const listeners = new Set<() => void>()

function refresh() {
  const raw = readRaw()
  if (current !== undefined && raw === currentRaw) return
  currentRaw = raw
  current = parseEditorSettings(raw)
}

/** 지금 설정. 훅 밖에서 한 번만 읽을 때 쓴다(풀이 화면의 처음 여는 언어). */
export function getEditorSettings(): EditorSettings {
  if (listeners.size === 0) refresh()
  return current!
}

function notify() {
  listeners.forEach((listener) => listener())
}

function onStorage(event: StorageEvent) {
  // key가 null이면 다른 탭이 저장소를 통째로 비운 것이다
  if (event.key !== null && event.key !== EDITOR_SETTINGS_KEY) return
  refresh()
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
    const raw = JSON.stringify(current)
    localStorage.setItem(EDITOR_SETTINGS_KEY, raw)
    currentRaw = raw
  } catch {
    // 저장이 막혔으면 이번 방문에만 적용된다
  }
  notify()
}

/** 화면 설정에서 바꾸면 열려 있는 에디터에 바로 적용된다. */
export function useEditorSettings(): EditorSettings {
  return useSyncExternalStore(subscribe, getEditorSettings)
}
