/** 줄 수. 끝의 줄바꿈 하나는 줄로 세지 않는다 — 에디터가 마지막 줄 뒤에 붙여 보낸다. */
export function countLines(sourceCode: string): number {
  return sourceCode.replace(/\r?\n$/, '').split('\n').length
}
