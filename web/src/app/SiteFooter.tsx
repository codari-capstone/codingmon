import { Link } from 'react-router'

import wordmark from '@/assets/brand/codingmon_wordmark.png'
import { BUSINESS, BUSINESS_REGISTERED, LEGAL_LINKS } from '@/features/legal/legalInfo'
import { SupportEmail } from '@/features/legal/SupportEmail'
import { cn } from '@/lib/utils'
import { MENU } from './menu'

/**
 * 모든 화면의 바닥글(AppShell이 그린다. 로그인·가입 흐름과 문제 풀이는 handle의 noFooter로 뺀다). PokeClip 바닥글과 같은 구성이다:
 * 왼쪽에 로고와 한 줄 소개, 오른쪽에 메뉴와 약관 링크, 아래에 운영·문의 한 줄.
 * 메뉴는 상단 바와 같은 MENU이고, 약관·문의·사업자 정보는 legalInfo 한 곳에서 온다(#335).
 */
export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="max-w-content mx-auto box-content grid gap-6 px-6 pt-12 pb-12 text-sm lg:grid-cols-[1fr_auto] lg:items-start lg:py-14">
        <div className="flex flex-col gap-3">
          <img src={wordmark} alt="Codingmon" width={117} height={32} className="block" />
          <p className="text-muted-foreground m-0">틀린 이유까지 알려 주는 코딩 멘토.</p>
        </div>

        {/* 메뉴와 약관 링크는 두 묶음이다. 사이에 세로선을 두고, 좁아서 묶음이 줄을 나눠 서면 선은 감춘다 */}
        <nav aria-label="바닥글" className="flex flex-wrap items-center gap-x-[22px] gap-y-2.5">
          <div className={GROUP}>
            {MENU.map((l) => (
              <Link key={l.to} to={l.to} className={cn(LINK, 'text-body-foreground')}>
                {l.label}
              </Link>
            ))}
          </div>
          <span aria-hidden className="bg-muted-foreground/40 hidden h-3.5 w-px sm:block" />
          <div className={GROUP}>
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className={cn(
                  LINK,
                  // 처리방침은 다른 링크와 구분되게 굵게 (개인정보위 작성지침)
                  l.strong ? 'text-foreground font-bold' : 'text-body-foreground',
                )}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </nav>

        <div className="text-muted-foreground flex flex-col gap-1.5 text-[13px] leading-[1.7] lg:col-span-full">
          {/* 사업자 정보(전자상거래법 제10조)는 사업자 등록을 마치면 나온다 */}
          {BUSINESS_REGISTERED ? (
            <p className="m-0">
              <Joined
                parts={[
                  `상호 ${BUSINESS.name}`,
                  `대표 ${BUSINESS.ceo}`,
                  `사업자등록번호 ${BUSINESS.registrationNo}`,
                  `통신판매업 신고번호 ${BUSINESS.mailOrderNo}`,
                  `주소 ${BUSINESS.address}`,
                  `전화 ${BUSINESS.phone}`,
                  `호스팅 서비스 제공자 ${BUSINESS.hosting}`,
                ]}
              />
            </p>
          ) : null}
          <p className="m-0">
            <Joined
              parts={[
                '운영 Codari 팀',
                <>
                  문의&nbsp;
                  <SupportEmail className="text-muted-foreground hover:text-foreground no-underline hover:underline" />
                </>,
                '© 2026 Codari',
              ]}
            />
          </p>
        </div>
      </div>
    </footer>
  )
}

const GROUP = 'flex flex-wrap gap-x-[22px] gap-y-2.5'
const LINK = 'hover:text-foreground no-underline'

/** `가 · 나 · 다`. 줄은 항목 사이에서만 바뀐다(`© 2026 / Codari`로 끊기지 않게). 가운뎃점은 읽어 주지 않는다 */
function Joined({ parts }: { parts: React.ReactNode[] }) {
  return parts.map((p, i) => (
    <span key={i}>
      {i > 0 ? <span aria-hidden> · </span> : null}
      <span className="whitespace-nowrap">{p}</span>
    </span>
  ))
}
