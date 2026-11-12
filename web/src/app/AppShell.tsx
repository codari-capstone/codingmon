import { AppHeader } from './AppHeader'

/** 모든 화면의 틀. 상단 바 + 본문. 화면 안의 2열(필터·표 등)은 각 화면이 짠다. */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <AppHeader />
      {/* 페이지 폭: 내용 1200px + 좌우 24px (box-content로 padding을 폭 밖에 둔다) */}
      <main className="max-w-content mx-auto box-content min-w-0 px-6 py-6">{children}</main>
    </div>
  )
}
