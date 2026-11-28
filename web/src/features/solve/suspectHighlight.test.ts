import { history, insertNewlineAndIndent, redo, undo } from '@codemirror/commands'
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

  it('묶인 편집을 한 번에 되돌리고 다시 해도 표시는 그 코드에 남는다', () => {
    const doc = 'n = 1\n\n\nprint(n)'
    let state = start([4], doc)
    // 빈 3번 줄 맨 앞에서 Backspace 두 번. 붙어 있는 delete.*라 기록이 한 묶음이 된다
    for (const at of [state.doc.line(3).from, state.doc.line(3).from - 1]) {
      state = state.update({
        changes: { from: at - 1, to: at },
        selection: EditorSelection.cursor(at - 1),
        userEvent: 'delete.backward',
      }).state
    }
    expect(markedLines(state)).toEqual([2])

    const dispatch = (tr: { state: EditorState }) => (state = tr.state)
    undo({ state, dispatch })
    expect(state.doc.toString()).toBe(doc) // 한 번에 다 돌아와야 묶인 것이다
    expect(markedLines(state)).toEqual([4])

    redo({ state, dispatch })
    expect(markedLines(state)).toEqual([2])
  })

  // deleteLine(Shift+Ctrl+K)이 지우는 범위: 줄과 뒤 줄바꿈, 마지막 줄이면 앞 줄바꿈
  it.each([
    ['첫 줄', 'cin >> a;\ncin >> a;\nx', 1],
    ['가운데 줄', 'x\ncin >> a;\ncin >> a;', 2],
    ['마지막 줄', 'cin >> a;\ncin >> a;', 2],
  ])('들여쓰기 없는 의심 줄(%s)을 통째로 지우면 같은 코드 줄로 옮겨 가지 않는다', (_, doc, n) => {
    const state = start([n], doc)
    const line = state.doc.line(n)
    const changes =
      line.to < state.doc.length
        ? { from: line.from, to: line.to + 1 }
        : { from: line.from - 1, to: line.to }
    expect(markedLines(state.update({ changes }).state)).toEqual([])
  })

  it('의심 줄부터 바꿔 넣었어도 그 줄이 그대로면 표시를 남긴다', () => {
    const state = start([1], 'a()\nb()')
    const next = state.update({ changes: { from: 0, to: state.doc.length, insert: 'a()\nc()' } })
    expect(markedLines(next.state)).toEqual([1])
  })

  it('처음 칠한 것은 되돌리기 기록에 남지 않는다', () => {
    const state = start([4])
    expect(undo({ state, dispatch: () => {} })).toBe(false)
  })
})
