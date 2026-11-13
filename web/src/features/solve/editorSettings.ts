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
    language: pick<Language>(saved.language, ['PYTHON', 'CPP'], d.language),
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

// 같은 문자열이면 같은 객체를 돌려준다. useSyncExternalStore는 스냅샷이 바뀌면 다시 그린다
let cache: { raw: string | null; value: EditorSettings } | undefined
// 저장이 막힌 브라우저에서도 이번 방문에는 바꾼 값이 적용되게 메모리에 둔다
let unsaved: EditorSettings | undefined
const listeners = new Set<() => void>()

function snapshot(): EditorSettings {
  if (unsaved) return unsaved
  const raw = readRaw()
  if (cache?.raw !== raw) cache = { raw, value: parseEditorSettings(raw) }
  return cache.value
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateEditorSettings(patch: Partial<EditorSettings>): void {
  const next = { ...snapshot(), ...patch }
  try {
    localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(next))
    unsaved = undefined
  } catch {
    unsaved = next
  }
  listeners.forEach((listener) => listener())
}

/** 화면 설정에서 바꾸면 열려 있는 에디터에 바로 적용된다. */
export function useEditorSettings(): EditorSettings {
  return useSyncExternalStore(subscribe, snapshot)
}
