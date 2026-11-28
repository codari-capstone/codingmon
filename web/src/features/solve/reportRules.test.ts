import { describe, expect, it } from 'vitest'

import { hasContentLikeServer, hasNul, reportLength, stripLikeServer } from './reportRules'

// 특수 공백은 코드 포인트로 만든다. 소스에 그대로 두면 보이지 않아 고치다 깨진다
const at = (...codes: number[]) => String.fromCodePoint(...codes)
const UNIT_SEPARATOR = at(0x1f) // Java만 공백으로 본다
const NBSP = at(0xa0) // JS trim()만 공백으로 본다
const LINE_SEPARATOR = at(0x2028)
const IDEOGRAPHIC_SPACE = at(0x3000)

describe('reportRules — 서버(ProblemReportController)와 같은 판정', () => {
  it('글자 수는 코드 포인트로 센다', () => {
    expect(reportLength('😀😀')).toBe(2)
    expect(reportLength('가나')).toBe(2)
  })

  it('널 문자가 있는지 본다', () => {
    expect(hasNul(`앞${at(0)}뒤`)).toBe(true)
    expect(hasNul('평범한 글')).toBe(false)
  })

  it('빈 내용 판정은 Java strip()과 같다 — JS trim()과 다른 두 경우', () => {
    // Java는 단위 구분자(U+001F)를 공백으로 본다. trim()은 아니라서 화면이 버튼을 켜고 서버가 400을 냈다
    expect(hasContentLikeServer(UNIT_SEPARATOR.repeat(3))).toBe(false)
    // Java는 줄바꿈 없는 공백을 글자로 본다. 서버는 받는다
    expect(hasContentLikeServer(NBSP)).toBe(true)
    expect(hasContentLikeServer(` \t\n${LINE_SEPARATOR}${IDEOGRAPHIC_SPACE}`)).toBe(false)
    expect(hasContentLikeServer(' 가 ')).toBe(true)
  })

  it('앞뒤를 Java strip()처럼 뗀다', () => {
    expect(stripLikeServer(`${UNIT_SEPARATOR} 예제가 달라요 \n`)).toBe('예제가 달라요')
    expect(stripLikeServer(`${NBSP}글${NBSP}`)).toBe(`${NBSP}글${NBSP}`)
  })
})
