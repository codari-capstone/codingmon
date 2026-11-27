import { EditorState } from '@uiw/react-codemirror'
import { describe, expect, it } from 'vitest'

import { markSuspectLines, suspectField, suspectHighlight } from './suspectHighlight'

/** 칠한 줄 번호(1부터) */
function marked(state: EditorState): number[] {
  const lines: number[] = []
  for (const it = state.field(suspectField).iter(); it.value; it.next()) {
    lines.push(state.doc.lineAt(it.from).number)
  }
  return lines
}

const CODE = 'a = 1\nb = 2\nprint(a)\nprint(b)'

function start(lines: number[]) {
  const state = EditorState.create({ doc: CODE, extensions: suspectHighlight })
  return state.update({ effects: markSuspectLines.of(lines) }).state
}

describe('suspectHighlight', () => {
  it('받은 줄을 칠하고 문서 밖 번호는 버린다', () => {
    expect(marked(start([2, 4, 9, 0]))).toEqual([2, 4])
  })

  it('위에 줄을 넣으면 표시가 같은 코드를 따라 내려간다', () => {
    const state = start([3])
    const next = state.update({ changes: { from: 0, insert: 'x = 0\n' } }).state
    expect(marked(next)).toEqual([4])
  })

  it('그 줄을 고치면 그 줄 표시만 지운다', () => {
    const state = start([2, 4])
    const line2 = state.doc.line(2)
    const next = state.update({ changes: { from: line2.to, insert: ' + 1' } }).state
    expect(marked(next)).toEqual([4])
  })

  it('줄 맨 앞에서 Enter로 위에 줄을 넣으면 표시가 그 코드를 따라 내려간다', () => {
    const state = start([2])
    const next = state.update({ changes: { from: state.doc.line(2).from, insert: '\n' } }).state
    expect(marked(next)).toEqual([3])
    expect(next.doc.line(3).text).toBe('b = 2')
  })

  it('줄 맨 앞에 글자를 넣으면 그 줄을 고친 것이다', () => {
    const state = start([2])
    const next = state.update({ changes: { from: state.doc.line(2).from, insert: '# ' } }).state
    expect(marked(next)).toEqual([])
  })

  it('바로 위 줄을 통째로 지워도 표시는 남는다', () => {
    const state = start([3])
    const line2 = state.doc.line(2)
    const next = state.update({ changes: { from: line2.from, to: line2.to + 1 } }).state
    expect(marked(next)).toEqual([2])
    expect(next.doc.line(2).text).toBe('print(a)')
  })
})
