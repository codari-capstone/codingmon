import { Outlet } from 'react-router'

import { BadgeCelebrator } from '@/features/badges/BadgeCelebrator'
import { AppShell } from './AppShell'

/** 모든 화면을 감싸는 레이아웃. 이 아래에서 AppShell을 또 부르면 헤더가 두 개가 된다. */
export function RootLayout() {
  return (
    <AppShell>
      <Outlet />
      {/* 채점이 끝나면 어느 화면에 있든 그 위에 띄운다 (BADGE-03) */}
      <BadgeCelebrator />
    </AppShell>
  )
}
