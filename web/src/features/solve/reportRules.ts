/**
 * 문제 신고 내용 규칙 (계약 `ReportInput.content`, 서버 `ProblemReportController`).
 * 신고 창과 목이 함께 쓴다 — 두 벌로 적으면 한쪽만 바뀌어 어긋난다.
 */
export const REPORT_CONTENT_MAX = 1000

/**
 * 글자 수. 서버는 `codePointCount`로 세고 계약도 스키마 `maxLength`(코드 포인트)와 같게 잰다.
 * `string.length`는 UTF-16 단위라 이모지 하나를 2로 세어, 서버가 받는 글을 화면이 막는다(코드 리뷰).
 */
export function reportLength(text: string): number {
  return [...text].length
}

/** 서버는 널 문자(코드 포인트 0)가 든 내용을 `code` 없는 400으로 거절한다 */
export function hasNul(text: string): boolean {
  return text.includes(String.fromCodePoint(0))
}

/**
 * Java `Character.isWhitespace`. 서버가 앞뒤를 떼는 `String.strip()`의 기준이다.
 * JS `trim()`과 두 가지가 다르다 — 제어 문자 U+001C~U+001F는 Java만 공백으로 보고,
 * 줄바꿈 없는 공백(U+00A0·U+2007·U+202F)은 JS만 공백으로 본다(#314 리뷰).
 * 코드 포인트를 숫자로 비교한다. 정규식에 특수 공백을 그대로 넣으면 고치다 보이지 않게 깨진다.
 */
function isServerWhitespace(char: string): boolean {
  const code = char.codePointAt(0)!
  // 탭·줄바꿈·세로 탭·폼 피드·캐리지 리턴(9~13), 파일·그룹·레코드·단위 구분자(28~31)
  if ((code >= 9 && code <= 13) || (code >= 28 && code <= 31)) return true
  // 줄바꿈 없는 공백(U+00A0·U+2007·U+202F)은 Java가 공백으로 보지 않는다
  if (code === 0xa0 || code === 0x2007 || code === 0x202f) return false
  // 줄 구분자(U+2028)·문단 구분자(U+2029)와 그 밖의 공백 구분자(Zs)
  return code === 0x2028 || code === 0x2029 || /^\p{Zs}$/u.test(char)
}

/** 서버의 `strip()` 뒤에 남는 글이 있는지. 없으면 400 `INVALID_REPORT_CONTENT`다 */
export function hasContentLikeServer(text: string): boolean {
  return [...text].some((char) => !isServerWhitespace(char))
}

/** 서버의 `strip()`과 같게 앞뒤를 뗀다. 목이 저장할 때 쓴다 */
export function stripLikeServer(text: string): string {
  const chars = [...text]
  let start = 0
  let end = chars.length
  while (start < end && isServerWhitespace(chars[start]!)) start += 1
  while (end > start && isServerWhitespace(chars[end - 1]!)) end -= 1
  return chars.slice(start, end).join('')
}
