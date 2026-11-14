import { useMatches } from 'react-router'

import { cn } from '@/lib/utils'
import { AppHeader } from './AppHeader'

/** 라우트 정의(router.tsx)의 `handle: { pageTone: 'subtle' }`로 고르는 바탕. 카드가 놓인 옅은 면(디자인 `cmx-subtle`)이다. */
export interface PageHandle {
  pageTone?: 'subtle'
  /** 본문을 페이지 폭에 가두지 않는다. 남색 무대가 좌우 끝까지 가는 화면(로그인·랜딩)이 쓴다 */
  bleed?: true
}

/** 모든 화면의 틀. 상단 바 + 본문. 화면 안의 2열(필터·표 등)은 각 화면이 짠다. */
export function AppShell({ children }: { children: React.ReactNode }) {
  const handles = useMatches().map((m) => m.handle as PageHandle | undefined)
  const subtle = handles.some((h) => h?.pageTone === 'subtle')
  const bleed = handles.some((h) => h?.bleed)
  return (
    <div className={cn('text-foreground min-h-dvh', subtle ? 'bg-muted' : 'bg-background')}>
      <AppHeader />
      {/* 페이지 폭: 내용 1200px + 좌우 24px (box-content로 padding을 폭 밖에 둔다) */}
      <main className={cn('min-w-0', !bleed && 'max-w-content mx-auto box-content px-6 py-6')}>
        {children}
      </main>
    </div>
  )
}
