import { cn } from 'cn'

/** 디자인 시스템의 선 아이콘 29개 (24px 격자, 선 2px, 둥근 끝). 경로는 design-system의 Icon과 같다. */
const PATHS = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  code: 'M8 8l-4 4 4 4m8-8l4 4-4 4m-2-11l-4 14',
  chart: 'M5 20V10m7 10V4m7 16v-7',
  trophy: 'M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4zM7 6H4v1a3 3 0 0 0 3 3m10-4h3v1a3 3 0 0 1-3 3',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0',
  users:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm-6 9a6 6 0 0 1 12 0m1-9.2a3.5 3.5 0 0 0 0-6.6M21 20a6 6 0 0 0-4-5.6',
  settings:
    'M4 7h10m4 0h2M4 17h2m4 0h10M14 7a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM6 17a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
  bell: 'M6 17v-6a6 6 0 0 1 12 0v6l2 2H4zm4 4h4',
  bulb: 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z',
  flame: 'M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zm0 13a3 3 0 0 1 3-3h11',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  bot: 'M12 4v3M7 7h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zm2.5 5v2m5-2v2',
  star: 'M12 4l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  play: 'M7 5v14l11-7z',
  'arrow-right': 'M5 12h14m-6-6 6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6L6 18',
  'chevron-right': 'M9 6l6 6-6 6',
  'chevron-left': 'M15 6l-6 6 6 6',
  'chevron-down': 'M6 9l6 6 6-6',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zm9 2l-4-4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  logout: 'M10 5H5v14h5m4-4l4-3-4-3m4 3H9',
  calendar: 'M5 6h14v14H5zM5 10h14M9 3v4m6-4v4',
} as const

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName
  /** 기본 18. 버튼 안 16–20, 사이드바 20 */
  size?: number
  /** 뜻을 전할 때만. 없으면 장식이라 화면 낭독기에서 숨긴다. */
  label?: string
  className?: string
}

export function Icon({ name, size = 18, label, className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <path
        d={PATHS[name]}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
