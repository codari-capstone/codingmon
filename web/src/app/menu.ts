/** 상단 바 메뉴 한 칸. `end`면 주소가 정확히 같을 때만 켠다(기본은 앞부분 일치). `also`는 함께 켤 주소(앞부분 일치)다. */
export type MenuItem = { to: string; label: string; also?: string; end?: boolean }

/** 학습자 메뉴. 상단 바(AppHeader)와 랜딩 바닥글이 같이 쓴다. */
export const MENU: MenuItem[] = [
  { to: '/problems', label: '문제' },
  { to: '/submissions', label: '제출 기록' },
  // 배지 화면도 내 학습 탭(LearnNav)의 한 칸이라 함께 켠다 (BADGE-02)
  { to: '/me/report', label: '내 학습', also: '/me/badges' },
]
