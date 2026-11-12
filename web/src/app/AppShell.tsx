import { AppHeader } from './AppHeader'

interface AppShellProps {
  /** 좌측 사이드바. 화면마다 다르다 — #21은 필터, #46은 숙련도를 넣는다. */
  sidebar?: React.ReactNode
  children: React.ReactNode
}

/**
 * 모든 화면의 틀. 상단바 + (사이드바 + 본문).
 *
 * 2열은 flex-wrap으로 만든다. 본문에 flex-[999] 를 줘서 좁아지면 사이드바가
 * 먼저 밀려 위로 쌓인다 (UX-05). 사이드바를 sticky나 100vh로 두지 않는 이유다.
 */
export function AppShell({ sidebar, children }: AppShellProps) {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <AppHeader />
      {/* 페이지 폭: 내용 1200px + 좌우 24px (box-content로 padding을 폭 밖에 둔다) */}
      <div className="max-w-content mx-auto box-content flex flex-wrap gap-6 px-6 py-6">
        {sidebar ? <aside className="min-w-0 flex-[1_1_13rem]">{sidebar}</aside> : null}
        <main className="min-w-0 flex-[999_1_40rem]">{children}</main>
      </div>
    </div>
  )
}
