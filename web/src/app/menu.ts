/** 학습자 메뉴. 상단 바(AppHeader)와 랜딩 바닥글이 같이 쓴다. */
export const MENU: { to: string; label: string; also?: string }[] = [
  { to: '/problems', label: '문제' },
  { to: '/submissions', label: '제출 기록' },
  // 배지 화면도 내 학습 탭(LearnNav)의 한 칸이라 함께 켠다 (BADGE-02)
  { to: '/me/report', label: '내 학습', also: '/me/badges' },
]
