import { history, insertNewlineAndIndent, undo } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { EditorSelection, EditorState, type StateCommand } from '@uiw/react-codemirror'
import { describe, expect, it } from 'vitest'

import { markedLines, markSuspectLines, suspectHighlight } from './suspectHighlight'

const CODE = 'n = int(input())\nfor i in range(n):\n    print(i)\nprint(n)'

function start(lines: number[], doc = CODE) {
  const state = EditorState.create({ doc, extensions: [python(), history(), suspectHighlight] })
  return state.update({ effects: markSuspectLines.of(lines) }).state
}

/** 커서를 놓고 에디터 명령(Enter)을 그대로 돌린다. 원시 삽입만 보면 들여쓰기 같은 실제 편집을 놓친다 */
function run(state: EditorState, cursor: number, command: StateCommand) {
  let next = state.update({ selection: EditorSelection.cursor(cursor) }).state
  command({ state: next, dispatch: (tr) => (next = tr.state) })
  return next
}

describe('suspectHighlight', () => {
  it('받은 줄을 칠하고 문서 밖 번호는 버린다', () => {
    expect(markedLines(start([2, 4, 9, 0]))).toEqual([2, 4])
  })

  it('위에 줄을 넣으면 표시가 같은 코드를 따라 내려간다', () => {
    const state = start([3])
    const next = state.update({ changes: { from: 0, insert: 'x = 0\n' } }).state
    expect(markedLines(next)).toEqual([4])
  })

  it('그 줄 안에 입력하면 그 줄 표시만 지운다', () => {
    const state = start([2, 4])
    const next = state.update({ changes: { from: state.doc.line(2).to, insert: ' # 고침' } }).state
    expect(markedLines(next)).toEqual([4])
  })

  it('바로 위 줄을 통째로 지워도 표시는 남는다', () => {
    const state = start([3])
    const line2 = state.doc.line(2)
    const next = state.update({ changes: { from: line2.from, to: line2.to + 1 } }).state
    expect(markedLines(next)).toEqual([2])
    expect(next.doc.line(2).text).toBe('    print(i)')
  })

  it('들여쓴 줄 맨 앞에서 Enter를 쳐도 그 코드를 따라간다', () => {
    const state = start([3])
    // 들여쓰기 뒤(코드 시작)에서 Enter. 에디터는 앞 공백을 지우고 새 줄에 들여쓰기를 다시 넣는다
    const next = run(state, state.doc.line(3).from + 4, insertNewlineAndIndent)
    expect(markedLines(next)).toEqual([4])
    expect(next.doc.line(4).text.trim()).toBe('print(i)')
  })

  it('줄 끝에서 Enter를 쳐도 표시는 그 줄에 남는다', () => {
    const state = start([4])
    const next = run(state, state.doc.line(4).to, insertNewlineAndIndent)
    expect(markedLines(next)).toEqual([4])
  })

  it('줄 맨 앞에서 Backspace로 위 줄과 합치면 지운다', () => {
    const state = start([4])
    // 줄 맨 앞의 Backspace는 바로 앞 줄바꿈 하나를 지운다(deleteCharBackward는 EditorView가 있어야 돈다)
    const from = state.doc.line(4).from
    const next = state.update({ changes: { from: from - 1, to: from } }).state
    expect(markedLines(next)).toEqual([])
  })

  it('줄 맨 앞에 줄바꿈으로 끝나지 않는 여러 줄을 붙여 넣으면 지운다', () => {
    const state = start([4])
    const next = state.update({
      changes: { from: state.doc.line(4).from, insert: 'x = 0\ny = ' },
    }).state
    expect(next.doc.line(5).text).toBe('y = print(n)')
    expect(markedLines(next)).toEqual([])
  })

  it('같은 줄에서 들여쓰기만 바꿔도 고친 것이다 — Python에서는 그것이 고침이다', () => {
    const state = start([3])
    const from = state.doc.line(3).from
    const next = state.update({ changes: { from, to: from + 4 } }).state
    expect(next.doc.line(3).text).toBe('print(i)')
    expect(markedLines(next)).toEqual([])
  })

  it('의심 줄을 통째로 지우면 뒤의 같은 코드 줄로 옮겨 가지 않는다', () => {
    const state = start([2], 'int main() {\n    }\n}')
    const line2 = state.doc.line(2)
    const next = state.update({ changes: { from: line2.from, to: line2.to + 1 } }).state
    expect(next.doc.toString()).toBe('int main() {\n}')
    expect(markedLines(next)).toEqual([])
  })

  it('되돌리기로 코드를 되돌리면 지운 표시도 돌아온다', () => {
    const state = start([4])
    const typed = state.update({ changes: { from: state.doc.line(4).to, insert: 'x' } }).state
    expect(markedLines(typed)).toEqual([])

    let undone = typed
    undo({ state: typed, dispatch: (tr) => (undone = tr.state) })
    expect(undone.doc.toString()).toBe(CODE)
    expect(markedLines(undone)).toEqual([4])
  })

  it('처음 칠한 것은 되돌리기 기록에 남지 않는다', () => {
    const state = start([4])
    expect(undo({ state, dispatch: () => {} })).toBe(false)
  })
})
