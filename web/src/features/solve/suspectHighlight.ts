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
 * 코드를 고치면 표시가 줄을 따라간다(위에 줄을 넣어도 같은 코드에 남는다). 그 줄 글자가 바뀌면 그 줄
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
    /*
      편집 종류를 하나씩 가려내지 않고 **줄의 코드가 그대로인지**만 본다. 코드가 시작하는 자리(들여쓰기 뒤)를
      뒤쪽(assoc 1)으로 옮긴 곳의 줄이 편집 전과 같은 코드면 남기고, 다르면 고친 것으로 보고 지운다.
      앞뒤 공백은 보지 않는다 — Enter가 들여쓰기를 다시 맞추는 것은 코드를 고친 것이 아니다.
      - 위에 줄 넣기·지우기, 줄 앞·끝에서 Enter: 같은 코드라 따라간다
      - 줄 안에 입력, 줄 앞 Backspace로 위 줄과 합침, 줄 앞에 여러 줄 붙여넣기: 코드가 달라져 지운다
      marks.map을 쓰지 않는다. 줄 표시는 바로 앞 글자가 지워지면 함께 사라져서 위 줄을 지우면 이 표시도 없어진다.
    */
    const kept: number[] = []
    for (const it = marks.iter(); it.value; it.next()) {
      const before = tr.startState.doc.lineAt(it.from)
      const codeStart = before.from + (before.text.length - before.text.trimStart().length)
      const after = tr.state.doc.lineAt(tr.changes.mapPos(codeStart, 1))
      if (after.text.trim() === before.text.trim()) kept.push(after.from)
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
