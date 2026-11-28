import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  EDITOR_DEFAULTS,
  EDITOR_SETTINGS_KEY,
  parseEditorSettings,
  updateEditorSettings,
  useEditorSettings,
} from './editorSettings'

describe('useEditorSettings (UX-07)', () => {
  afterEach(() => {
    updateEditorSettings(EDITOR_DEFAULTS)
    localStorage.clear()
  })

  it('다른 탭에서 바꾼 값을 storage 이벤트로 바로 받는다', () => {
    const { result } = renderHook(() => useEditorSettings())
    expect(result.current.fontSize).toBe(14)

    act(() => {
      const raw = JSON.stringify({ ...EDITOR_DEFAULTS, fontSize: 18 })
      localStorage.setItem(EDITOR_SETTINGS_KEY, raw)
      // 다른 탭의 setItem은 이 탭에 storage 이벤트로만 온다
      window.dispatchEvent(new StorageEvent('storage', { key: EDITOR_SETTINGS_KEY, newValue: raw }))
    })
    expect(result.current.fontSize).toBe(18)
  })

  it('듣는 화면이 없던 사이 다른 탭이 바꾼 값도 다시 열 때 읽는다 (낡은 값 위에 덮어쓰지 않게)', () => {
    // 한 번 열었다 닫아 메모리에 값이 남은 상태
    const first = renderHook(() => useEditorSettings())
    expect(first.result.current.fontSize).toBe(14)
    first.unmount()

    // 듣는 쪽이 없어 storage 이벤트를 놓친다
    localStorage.setItem(
      EDITOR_SETTINGS_KEY,
      JSON.stringify({ ...EDITOR_DEFAULTS, fontSize: 18, language: 'CPP' }),
    )

    const again = renderHook(() => useEditorSettings())
    expect(again.result.current.fontSize).toBe(18)
    // 그 위에 한 칸만 고쳐도 다른 탭의 값이 남는다
    act(() => updateEditorSettings({ lineNumbers: false }))
    expect(JSON.parse(localStorage.getItem(EDITOR_SETTINGS_KEY)!)).toMatchObject({
      fontSize: 18,
      language: 'CPP',
      lineNumbers: false,
    })
  })

  it('다른 키의 storage 이벤트에는 다시 읽지 않는다', () => {
    const { result } = renderHook(() => useEditorSettings())
    const before = result.current
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'codari-theme', newValue: 'dark' }))
    })
    expect(result.current).toBe(before)
  })
})

describe('parseEditorSettings (UX-07)', () => {
  it('저장한 값이 없거나 깨졌으면 기본값이다', () => {
    expect(parseEditorSettings(null)).toEqual(EDITOR_DEFAULTS)
    expect(parseEditorSettings('{not json')).toEqual(EDITOR_DEFAULTS)
    expect(parseEditorSettings('"CPP"')).toEqual(EDITOR_DEFAULTS)
  })

  it('칸마다 아는 값만 받고 모르는 값은 그 칸만 기본값으로 둔다', () => {
    const raw = JSON.stringify({
      language: 'CPP',
      fontSize: 99, // 고를 수 없는 크기
      tabSize: 2,
      lineNumbers: 'no', // 불리언이 아님
      closeBrackets: false,
      lineWrapping: true,
    })
    expect(parseEditorSettings(raw)).toEqual({
      language: 'CPP',
      fontSize: EDITOR_DEFAULTS.fontSize,
      tabSize: 2,
      lineNumbers: EDITOR_DEFAULTS.lineNumbers,
      closeBrackets: false,
      lineWrapping: true,
    })
  })
})
