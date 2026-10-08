import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

/** UX-04 404 페이지 */
export function Component() {
  return (
    <section className="flex flex-col items-center py-20 text-center">
      <p className="text-muted-foreground/50 font-mono text-4xl font-medium">404</p>
      <h1 className="mt-3 text-xl font-semibold">페이지를 찾을 수 없습니다</h1>
      <p className="text-muted-foreground mt-2 text-sm">주소가 바뀌었거나 삭제된 페이지입니다.</p>
      <Button asChild variant="outline" className="mt-6 min-h-11">
        <Link to="/problems">문제 목록으로</Link>
      </Button>
    </section>
  )
}
