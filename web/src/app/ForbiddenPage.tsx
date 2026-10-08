import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

/** UX-04 권한 없음 페이지. 권한 검사(COM-05)가 여기로 보낸다. */
export function Component() {
  return (
    <section className="flex flex-col items-center py-20 text-center">
      <p className="text-muted-foreground/50 font-mono text-4xl font-medium">403</p>
      <h1 className="mt-3 text-xl font-semibold">권한이 없습니다</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        이 화면을 볼 수 있는 권한이 없습니다. 로그인 계정을 확인해 주세요.
      </p>
      <Button asChild variant="outline" className="mt-6 min-h-11">
        <Link to="/problems">문제 목록으로</Link>
      </Button>
    </section>
  )
}
