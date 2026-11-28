/** 페이지 번호 버튼을 접을 때 현재 페이지 양옆으로 남기는 개수. */
const SIBLINGS = 1

/**
 * 보여 줄 페이지 번호. 양 끝(1, 마지막)은 늘 두고, 사이가 끊기면 null을 넣는다.
 *
 * 문제가 늘면 페이지도 늘어난다. 번호를 전부 그리면 어느 폭에서든 줄이 넘치므로
 * 처음부터 접어 둔다. null은 Pagination이 '…'로 그린다. 컴포넌트가 아니라
 * 여기 두는 이유는 순수 계산이어서다 — 컴포넌트 파일에서 함수를 내보내면
 * react-refresh 경고가 붙고, 테스트도 렌더 없이 돌 수 있다.
 */
export function pageItems(page: number, pageCount: number): (number | null)[] {
  const pages = new Set<number>([1, pageCount])
  for (let near = page - SIBLINGS; near <= page + SIBLINGS; near += 1) {
    if (near >= 1 && near <= pageCount) pages.add(near)
  }

  const sorted = [...pages].sort((a, b) => a - b)
  const items: (number | null)[] = []
  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1]
    if (previous !== undefined && value - previous > 1) items.push(null)
    items.push(value)
  }
  return items
}
