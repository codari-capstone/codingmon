import { Outlet } from 'react-router'

import { AppShell } from './AppShell'

/** 모든 화면을 감싸는 레이아웃. 사이드바가 필요한 화면은 자기 안에서 AppShell을 다시 쓰지 않고 이 슬롯을 쓴다. */
export function RootLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}
