import { Link } from 'react-router'

/** UX-04 404 페이지 */
export function Component() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">페이지를 찾을 수 없습니다</h1>
      <p className="text-muted-foreground">주소가 바뀌었거나 삭제된 페이지입니다.</p>
      <Link to="/problems" className="text-primary underline">
        문제 목록으로 가기
      </Link>
    </section>
  )
}
