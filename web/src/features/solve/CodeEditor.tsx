import { cpp } from '@codemirror/lang-cpp'
import { python } from '@codemirror/lang-python'
import CodeMirror, { EditorView, type ViewUpdate } from '@uiw/react-codemirror'
import { useEffect, useMemo, useState } from 'react'

import type { Language } from '@/api/types'
import { useTheme } from '@/app/useTheme'
import { useEditorSettings } from './editorSettings'
import { markedLines, markSuspectLines, suspectHighlight } from './suspectHighlight'

/** 언어별 문법. 줄 번호·자동 들여쓰기·괄호 짝은 basicSetup 기본값이 준다 (SOLVE-05). */
const SYNTAX = { PYTHON: python, CPP: cpp } satisfies Record<Language, unknown>

/**
 * 코드 에디터 (SOLVE-05).
 *
 * 테마는 앱 테마를 그대로 받는다. 이 줄이 없으면 다크 모드에서 화면은 어두운데
 * 에디터만 하얗다 — 기본값이 라이트다.
 */
export function CodeEditor({
  language,
  value,
  onChange,
  label = '코드 편집기',
  readOnly = false,
  minHeight = '24rem',
  suspectLines,
  onSuspectLinesChange,
}: {
  language: Language
  value: string
  onChange: (next: string) => void
  /**
   * 편집 영역의 이름. 한 화면에 에디터가 둘 이상이면 넘겨야 한다 (ADM-05는 Python·C++를
   * 나란히 둔다) — 같은 이름이 둘이면 스크린 리더로는 어느 칸이 어느 언어인지 알 수 없다.
   */
  label?: string
  /**
   * 편집을 막는다. 보내는 중에 더 친 글자는 서버로 가지 않으므로, 그 사이 입력을 받으면
   * 안내도 없이 사라지거나 방금 보낸 것과 어긋난다 (ADM-05 저장·검증).
   *
   * `disabled` 대신 이 prop을 두는 까닭: CodeMirror의 편집 영역은 contenteditable이라
   * 바깥 `fieldset`의 `disabled`가 닿지 않는다.
   */
  readOnly?: boolean
  /** 화면 설정의 미리 보기처럼 짧게 둘 때만 바꾼다 */
  minHeight?: string
  /**
   * AI가 의심한 줄(1부터). 값이 들어올 때와 에디터가 새로 켜질 때 칠한다. 고친 줄은 에디터가 스스로
   * 지우고(suspectHighlight) 남은 줄을 `onSuspectLinesChange`로 알린다 — 그 값을 다시 넘기면
   * 화면 폭이 바뀌어 에디터가 새로 켜져도 남은 표시가 그대로다.
   */
  suspectLines?: number[]
  onSuspectLinesChange?: (lines: number[]) => void
}) {
  const { theme } = useTheme()
  const [view, setView] = useState<EditorView>()
  // 내용으로 비교한다. 분석이 다시 오면(힌트를 열면) 같은 줄인데 배열이 새로 와서 다시 칠하게 된다
  const suspectKey = suspectLines?.join(',') ?? ''
  useEffect(() => {
    if (view && suspectKey)
      view.dispatch({ effects: markSuspectLines.of(suspectKey.split(',').map(Number)) })
  }, [view, suspectKey])
  const reportSuspectLines = (update: ViewUpdate) => {
    const after = markedLines(update.state)
    if (after.join(',') !== markedLines(update.startState).join(',')) onSuspectLinesChange?.(after)
  }
  // 화면 설정(UX-07). 바꾸면 열려 있는 에디터에도 바로 적용된다
  const settings = useEditorSettings()

  // 배열이 매 렌더 새로 생기면 확장을 그때마다 다시 설정한다 — 글자를 칠 때마다다.
  // aria-label은 편집 영역(contenteditable)에 붙어야 한다. 바깥 div에 붙이면
  // 스크린 리더가 textbox의 이름으로 읽지 않는다.
  const extensions = useMemo(
    () => [
      SYNTAX[language](),
      suspectHighlight,
      EditorView.contentAttributes.of({ 'aria-label': label }),
      ...(settings.lineWrapping ? [EditorView.lineWrapping] : []),
    ],
    [language, label, settings.lineWrapping],
  )
  // 위와 같은 이유로 객체를 렌더마다 새로 만들지 않는다
  const basicSetup = useMemo(
    () => ({
      lineNumbers: settings.lineNumbers,
      closeBrackets: settings.closeBrackets,
      // tabSize는 들여쓰기 단위(indentUnit)도 함께 정한다
      tabSize: settings.tabSize,
    }),
    [settings.lineNumbers, settings.closeBrackets, settings.tabSize],
  )

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={theme}
      extensions={extensions}
      onCreateEditor={setView}
      onUpdate={reportSuspectLines}
      basicSetup={basicSetup}
      readOnly={readOnly}
      minHeight={minHeight}
      style={{ fontSize: settings.fontSize }}
      className="overflow-hidden rounded-lg border"
    />
  )
}
