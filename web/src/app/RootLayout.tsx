import { Outlet } from 'react-router'

/**
 * 모든 화면을 감싸는 레이아웃. 상단 내비게이션(COM-01)과 권한 검사(COM-05)는
 * 해당 이슈에서 이 자리에 붙인다.
 */
export function RootLayout() {
  return (
    <div className="bg-background text-foreground min-h-dvh">
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
