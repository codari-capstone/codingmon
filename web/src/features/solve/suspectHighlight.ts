import {
  Decoration,
  type EditorState,
  EditorView,
  GutterMarker,
  gutterLineClass,
  RangeSet,
  StateEffect,
  StateField,
  type DecorationSet,
} from '@uiw/react-codemirror'

/** 이 줄들(1부터)을 의심 줄로 칠한다. 문서 밖 번호는 버린다. */
export const markSuspectLines = StateEffect.define<number[]>()

const lineMark = Decoration.line({ class: 'cm-suspect-line' })
const gutterMark = new (class extends GutterMarker {
  override elementClass = 'cm-suspect-gutter'
})()

/**
 * AI가 의심한 줄의 노란 표시.
 *
 * 코드를 고치면 표시가 줄을 따라간다(위에 줄을 넣어도 같은 코드에 남는다). 그 줄 자체를 고치면 그 줄
 * 표시만 지운다 — 고치기 시작한 줄을 계속 의심이라고 칠하면 틀린 말이 된다.
 */
export const suspectField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    for (const effect of tr.effects) {
      if (!effect.is(markSuspectLines)) continue
      const { doc } = tr.state
      return Decoration.set(
        effect.value
          .filter((n) => n >= 1 && n <= doc.lines)
          .map((n) => lineMark.range(doc.line(n).from)),
        true,
      )
    }
    if (!tr.docChanged || marks.size === 0) return marks
    const changed: [number, number, boolean][] = []
    tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) =>
      changed.push([fromA, toA, inserted.lines > 1]),
    )
    const touched = (from: number) => {
      const line = tr.startState.doc.lineAt(from)
      return changed.some(
        ([a, b, newline]) =>
          a <= line.to &&
          b >= line.from &&
          // 바로 위 줄을 통째로 지우는 것(끝이 이 줄 시작)은 이 줄을 고친 것이 아니다
          !(a < b && b === line.from) &&
          // 줄 맨 앞에서 Enter로 위에 줄을 넣는 것도 아니다. 표시는 아래로 밀린 그 코드를 따라간다
          !(a === b && a === line.from && newline),
      )
    }
    // marks.map을 쓰지 않는다. 줄 표시는 바로 앞 글자가 지워지면 함께 사라져서, 위 줄을 지우면 이 줄 표시도 없어진다
    const kept: number[] = []
    for (const it = marks.iter(); it.value; it.next()) {
      if (!touched(it.from)) kept.push(tr.state.doc.lineAt(tr.changes.mapPos(it.from, 1)).from)
    }
    return Decoration.set(
      [...new Set(kept)].map((from) => lineMark.range(from)),
      true,
    )
  },
  provide: (field) => [
    EditorView.decorations.from(field),
    gutterLineClass.compute([field], (state) => {
      const ranges = []
      for (const it = state.field(field).iter(); it.value; it.next())
        ranges.push(gutterMark.range(it.from))
      return RangeSet.of(ranges)
    }),
  ],
})

const suspectTheme = EditorView.baseTheme({
  '.cm-suspect-line': { backgroundColor: 'var(--warning-soft)' },
  '.cm-gutterElement.cm-suspect-gutter': { color: 'var(--warning-text)', fontWeight: '700' },
})

export const suspectHighlight = [suspectField, suspectTheme]

/** 지금 칠한 줄 번호(1부터) */
export function markedLines(state: EditorState): number[] {
  const lines: number[] = []
  for (const it = state.field(suspectField).iter(); it.value; it.next()) {
    lines.push(state.doc.lineAt(it.from).number)
  }
  return lines
}
