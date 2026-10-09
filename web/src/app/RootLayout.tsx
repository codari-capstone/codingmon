import { Outlet } from 'react-router'

import { AppShell } from './AppShell'

/**
 * 모든 화면을 감싸는 레이아웃.
 *
 * AppShell에 sidebar 슬롯이 있지만 아직 어떤 라우트와도 연결되어 있지 않다.
 * 사이드바가 필요한 화면(#21 필터, #46 숙련도)은 중첩 레이아웃 라우트를 추가해
 * 그 라우트가 <AppShell sidebar={...}> 를 직접 호출하는 방식으로 붙인다.
 * AppShell을 중첩해서 쓰면 헤더가 두 개가 된다.
 */
export function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
