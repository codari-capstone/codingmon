import { Link } from 'react-router'

import wordmark from '@/assets/brand/codingmon_wordmark.png'
import { MENU } from './menu'

/** 랜딩·요금제처럼 좌우 끝까지 가는(bleed) 화면의 바닥글. 메뉴는 상단 바와 같은 MENU다. */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="max-w-content text-muted-foreground mx-auto box-content flex flex-wrap items-center justify-between gap-4 px-6 pt-8 pb-10 text-sm">
        <img src={wordmark} alt="Codingmon" width={117} height={32} className="block" />
        {/* 이용약관·개인정보처리방침·환불 정책은 문서가 생기면 더한다 (#244, #331) */}
        <nav aria-label="바닥글" className="flex flex-wrap gap-x-6 gap-y-2">
          {MENU.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="text-muted-foreground hover:text-foreground no-underline"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <span>© 2026 Codari</span>
      </div>
    </footer>
  )
}
