import { Outlet } from 'react-router'

import { AppShell } from './AppShell'

/** 모든 화면을 감싸는 레이아웃. 이 아래에서 AppShell을 또 부르면 헤더가 두 개가 된다. */
export function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
