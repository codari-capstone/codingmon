import { describe, expect, it } from 'vitest'

import { EDITOR_DEFAULTS, parseEditorSettings } from './editorSettings'

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
