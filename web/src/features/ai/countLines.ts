/** 줄 수. 끝의 줄바꿈 하나는 줄로 세지 않는다 — 에디터가 마지막 줄 뒤에 붙여 보낸다. */
export function countLines(sourceCode: string): number {
  return sourceCode.replace(/\r?\n$/, '').split('\n').length
}

/**
 * 짚어도 되는 의심 줄 번호 (AI-03). 1부터 제출 코드의 줄 수까지만 남기고 겹치면 하나로 줄인다.
 *
 * 계약: 서버가 범위 밖 번호를 지우고 저장하지만(#79) 그 전에 저장된 분석이 남아 있다. 없는 줄을
 * 짚으면 학생이 그 줄을 찾아 헤맨다. AI 패널의 문구와 제출한 코드의 빨간 줄이 같은 목록을 쓴다.
 */
export function suspectLines(lines: number[], sourceCode: string): number[] {
  const count = countLines(sourceCode)
  return [...new Set(lines)].filter((line) => Number.isInteger(line) && line >= 1 && line <= count)
}
