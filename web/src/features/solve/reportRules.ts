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
