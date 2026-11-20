import { useMatches } from 'react-router'

import { cn } from '@/lib/utils'
import { AppHeader } from './AppHeader'
import { SiteFooter } from './SiteFooter'

/** 라우트 정의(router.tsx)의 `handle: { pageTone: 'subtle' }`로 고르는 바탕. 카드가 놓인 옅은 면(디자인 `cmx-subtle`)이다. */
export interface PageHandle {
  pageTone?: 'subtle'
  /** 본문을 페이지 폭에 가두지 않는다. 남색 무대가 좌우 끝까지 가는 화면(로그인·랜딩)이 쓴다 */
  bleed?: true
  /** 본문 폭을 1200px 대신 1600px까지 쓴다. 코드를 나란히 보는 화면(문제 풀이·제출 결과)이 쓴다(#327) */
  wide?: true
  /** 탭 제목. `문제 목록`이면 `문제 목록 | Codingmon`이 된다(PageHead) */
  title?: string
  /** 검색 결과에 보일 설명. 없으면 사이트 공통 설명 */
  description?: string
  /** 검색에 내보내지 않는다. 아래 화면 모두에 걸린다 */
  noindex?: true
  /** 바닥글을 두지 않는다. 화면 높이에 맞춰 짠 화면(로그인의 남색 패널, 에디터가 따라오는 문제 풀이)이 쓴다 */
  noFooter?: true
}

/**
 * 모든 화면의 틀. 상단 바 + 본문 + 바닥글. 화면 안의 2열(필터·표 등)은 각 화면이 짠다.
 *
 * @param contained 화면의 handle과 관계없이 페이지 폭에 가둔다. 오류 화면(RouteErrorBoundary)이 쓴다 —
 *   useMatches()는 오류가 난 라우트의 handle도 돌려줘서, /login 청크가 실패하면 오류 안내가
 *   좌우 여백 없이 붙는다(#284 리뷰).
 */
export function AppShell({
  children,
  contained = false,
}: {
  children: React.ReactNode
  contained?: boolean
}) {
  const handles = useMatches().map((m) => m.handle as PageHandle | undefined)
  const subtle = handles.some((h) => h?.pageTone === 'subtle')
  const bleed = !contained && handles.some((h) => h?.bleed)
  const wide = !contained && handles.some((h) => h?.wide)
  // 오류 화면은 어느 화면에서 났든 바닥글을 둔다
  const footer = contained || !handles.some((h) => h?.noFooter)
  return (
    <div
      className={cn(
        'text-foreground flex min-h-dvh flex-col',
        subtle ? 'bg-muted' : 'bg-background',
      )}
    >
      <AppHeader wide={wide} />
      {/* 본문이 짧아도 바닥글이 화면 맨 아래에 붙게 본문 칸이 남은 높이를 채운다.
          main을 바로 flex 항목으로 두면 mx-auto 때문에 내용 폭만큼 줄어들어 한 겹 감싼다 */}
      <div className="flex-1">
        {/* 페이지 폭: 내용 1200px(wide는 1600px) + 좌우 24px (box-content로 padding을 폭 밖에 둔다) */}
        <main
          className={cn(
            'min-w-0',
            !bleed && 'mx-auto box-content px-6 py-6',
            !bleed && (wide ? 'max-w-wide' : 'max-w-content'),
          )}
        >
          {children}
        </main>
      </div>
      {/* 모든 화면의 바닥글 (#335). 화면이 따로 그리지 않는다 */}
      {footer ? <SiteFooter /> : null}
    </div>
  )
}
