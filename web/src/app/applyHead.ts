/**
 * index.html의 정적 제목·설명 태그 내용을 바꾼다. PageHead와 이를 대체하는 RouteErrorBoundary가 함께 쓴다.
 * head에 덮어쓸 값이 늘면 여기에 더한다. 한쪽만 고치면 오류 화면에 이전 화면 값이 남는다(#352 리뷰)
 */
export function applyHead(title: string, description: string) {
  document.title = title
  document.querySelector('meta[name="description"]')?.setAttribute('content', description)
}
