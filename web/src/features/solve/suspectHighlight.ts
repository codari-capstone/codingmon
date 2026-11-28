import { invertedEffects } from '@codemirror/commands'
import {
  type ChangeDesc,
  Decoration,
  type EditorState,
  EditorView,
  GutterMarker,
  gutterLineClass,
  MapMode,
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
 * 한 번의 삭제가 코드 시작부터 줄바꿈까지 가져갔는지. TrackDel은 삭제 범위 **안쪽** 자리만 지워졌다고
 * 본다. 들여쓰기 없는 줄을 통째로 지우면 코드 시작이 범위의 첫 자리라 다음 줄로 옮겨 간다.
 */
function removesLine(changes: ChangeDesc, codeStart: number, lineEnd: number): boolean {
  let removed = false
  changes.iterChangedRanges((from, to, fromB, toB) => {
    // 넣은 글자가 없는 순수 삭제만 본다. 바꿔 넣기는 그 줄이 남았는지 아래의 줄 비교가 가린다
    if (fromB === toB && from <= codeStart && to > lineEnd) removed = true
  })
  return removed
}

/**
 * AI가 의심한 줄의 노란 표시.
 *
 * 코드를 고치면 표시가 줄을 따라간다(위에 줄을 넣어도 같은 코드에 남는다). 그 줄 글자가 바뀌면 그 줄
 * 표시만 지운다 — 고치기 시작한 줄을 계속 의심이라고 칠하면 틀린 말이 된다.
 */
export const suspectField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(marks, tr) {
    // 묶인 편집을 되돌리면 효과가 새 편집 것부터 옛 편집 것 순으로 함께 온다. 마지막이 묶음 전 상태다
    const effect = tr.effects.filter((it) => it.is(markSuspectLines)).at(-1)
    if (effect) {
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
      편집 종류를 하나씩 가려내지 않고 **줄이 그대로인지**만 본다. 코드가 시작하는 자리(들여쓰기 뒤)를
      뒤쪽(assoc 1)으로 옮긴 곳의 줄을 편집 전 줄과 비교한다.
      - 그 자리가 지워졌으면(줄을 통째로 지움) 지운다. 옮겨 간 자리의 다음 줄이 같은 코드(`}`)여도 칠하지 않는다
      - 글자가 같으면 남긴다: 위에 줄 넣기·지우기, 줄 끝에서 Enter
      - 코드 앞에서 줄이 갈라졌으면(Enter) 들여쓰기는 보지 않는다. Enter가 들여쓰기를 다시 맞추는 것은 고친 게 아니다
      - 그 밖에 달라졌으면 지운다: 줄 안에 입력, 들여쓰기만 바꿈(Python에서는 이것이 고침이다),
        줄 앞 Backspace로 위 줄과 합침, 줄 앞에 여러 줄 붙여넣기
      marks.map을 쓰지 않는다. 줄 표시는 바로 앞 글자가 지워지면 함께 사라져서 위 줄을 지우면 이 표시도 없어진다.
    */
    const kept: number[] = []
    for (const it = marks.iter(); it.value; it.next()) {
      const before = tr.startState.doc.lineAt(it.from)
      const codeStart = before.from + (before.text.length - before.text.trimStart().length)
      const mapped = tr.changes.mapPos(codeStart, 1, MapMode.TrackDel)
      if (mapped === null || removesLine(tr.changes, codeStart, before.to)) continue
      const after = tr.state.doc.lineAt(mapped)
      const split = tr.state.doc.lineAt(tr.changes.mapPos(before.from, -1)).number !== after.number
      if (after.text === before.text || (split && after.text.trim() === before.text.trim())) {
        kept.push(after.from)
      }
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
  // 커서가 있는 줄은 다크 테마의 active line 배경이 덮는다. 두 클래스를 겹쳐 우선순위를 높인다
  '.cm-suspect-line, .cm-activeLine.cm-suspect-line': { backgroundColor: 'var(--warning-soft)' },
  '.cm-gutterElement.cm-suspect-gutter': { color: 'var(--warning-text)', fontWeight: '700' },
})

/**
 * 되돌리기(undo)로 코드를 되돌리면 지운 표시도 돌아온다. 편집이 표시를 바꿨으면 그 전 줄들을 다시 칠하는
 * 효과를 기록에 남긴다. 처음 칠하는 것(편집 없는 효과)은 남기지 않는다 — 되돌리기 한 번에 표시가 사라지면 안 된다.
 */
const undoMarks = invertedEffects.of((tr) => {
  if (!tr.docChanged) return []
  const before = markedLines(tr.startState)
  return before.join(',') === markedLines(tr.state).join(',') ? [] : [markSuspectLines.of(before)]
})

export const suspectHighlight = [suspectField, suspectTheme, undoMarks]

/** 지금 칠한 줄 번호(1부터) */
export function markedLines(state: EditorState): number[] {
  const lines: number[] = []
  for (const it = state.field(suspectField).iter(); it.value; it.next()) {
    lines.push(state.doc.lineAt(it.from).number)
  }
  return lines
}
