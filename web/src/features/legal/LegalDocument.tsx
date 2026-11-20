import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'

import type { LegalVersion } from './legalInfo'

export interface LegalSection {
  /** 목차가 가리키는 주소 조각(#id). 다른 문서가 이 값으로 링크하므로 바꾸지 않는다 */
  id: string
  title: string
  body: ReactNode
}

/**
 * 이용약관·개인정보 처리방침·환불 정책의 틀 (LEGAL-01~03, #335).
 *
 * PokeClip의 약관 페이지와 같은 구성이다: 제목 → 시행일 드롭다운 → 머리말 → 목차 상자 → 조·절.
 * 읽는 화면이라 한 줄 길이를 760px에서 끊고, 표만 상자 안에서 가로로 민다(페이지 가로 넘침 금지).
 */
export function LegalDocument({
  title,
  versions,
  current,
  intro,
  sections,
}: {
  title: string
  /** 판 목록. 맨 앞이 현재 판이다 */
  versions: LegalVersion[]
  /** 이 화면이 보여 주는 판의 주소 */
  current: string
  intro?: ReactNode
  sections: LegalSection[]
}) {
  return (
    <article className="mx-auto box-content max-w-[760px] px-6 pt-10 pb-16 lg:pt-16 lg:pb-24">
      <header className="border-b pb-6">
        <h1 className="text-foreground m-0 text-[clamp(28px,24px+1vw,36px)] leading-[1.3] font-bold tracking-[-0.02em]">
          {title}
        </h1>
        <VersionMenu versions={versions} current={current} />
        {intro ? (
          <p className={`text-body-foreground mt-4 mb-0 leading-[1.75] ${LINK}`}>{intro}</p>
        ) : null}
      </header>

      <nav
        aria-label="목차"
        className="bg-muted mt-6 mb-2 rounded-[16px] border px-[22px] py-[18px]"
      >
        <ol className="m-0 grid list-none gap-1.5 p-0 text-sm">
          {sections.map((s) => (
            <li key={s.id}>
              {/* Link로 옮겨야 ScrollRestoration이 그 절로 내려 준다. 평범한 a는 라우터를 건너뛴다.
                  스크롤만으로는 키보드 초점이 목차에 남아, Tab이 다음 목차로 간다. 그래서 그 절로
                  초점을 옮긴다(스크롤은 라우터가 하니 초점은 화면을 움직이지 않게) */}
              <Link
                to={{ hash: s.id }}
                onClick={() => document.getElementById(s.id)?.focus({ preventScroll: true })}
                className="text-muted-foreground hover:text-foreground no-underline hover:underline"
              >
                {s.title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      {sections.map((s) => (
        // 목차로 점프했을 때 제목이 화면 맨 위에 붙지 않게 숨 쉴 틈을 둔다
        // tabIndex -1: 목차가 초점을 옮길 수 있게 한다(Tab 순서에는 넣지 않는다)
        <section
          key={s.id}
          id={s.id}
          aria-labelledby={`${s.id}-title`}
          tabIndex={-1}
          className="scroll-mt-6 focus:outline-none"
        >
          <h2
            id={`${s.id}-title`}
            className="text-foreground mt-11 mb-0 text-[clamp(19px,18px+0.3vw,22px)] leading-[1.4] font-bold"
          >
            {s.title}
          </h2>
          <div className={BODY}>{s.body}</div>
        </section>
      ))}
    </article>
  )
}

/** 본문 링크. 문서 안에서는 밑줄로 링크임을 보인다 */
const LINK =
  '[&_a]:text-primary-text [&_a]:underline [&_a]:underline-offset-[0.15em] [&_a:hover]:no-underline'

/** 조·절 본문. 목록 기호는 preflight가 지우므로 여기서 되살린다 */
const BODY = [
  'text-body-foreground mt-3 leading-[1.75] [overflow-wrap:anywhere]',
  '[&_p]:m-0 [&>*+*]:mt-2.5',
  '[&_ol]:m-0 [&_ol]:list-decimal [&_ol]:pl-[22px] [&_ul]:m-0 [&_ul]:list-disc [&_ul]:pl-[22px]',
  '[&_li+li]:mt-1 [&_li>ul]:mt-1.5 [&_strong]:text-foreground [&_strong]:font-semibold',
  LINK,
].join(' ')

/**
 * 처리하는 항목·보유 기간 같은 표. 좁은 화면에서는 이 상자 안에서만 가로로 민다.
 * 키보드로도 밀 수 있게 상자가 초점을 받는다(role=region + 이름).
 *
 * @param rowHeader 첫 칸을 행 제목(th)으로 그린다. 항목을 열로 비교하는 표가 쓴다
 */
export function LegalTable({
  label,
  head,
  rows,
  rowHeader = false,
}: {
  label: string
  head: string[]
  rows: ReactNode[][]
  rowHeader?: boolean
}) {
  return (
    <div
      role="region"
      aria-label={label}
      tabIndex={0}
      className="focus-visible:outline-ring overflow-x-auto rounded-[12px] border focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <table className="w-full min-w-[520px] border-collapse text-sm leading-[1.6]">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col" className={`${CELL} ${HEAD_CELL}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            <tr key={r} className="[&:last-child>*]:border-b-0">
              {cells.map((c, i) =>
                rowHeader && i === 0 ? (
                  <th key={i} scope="row" className={`${CELL} ${HEAD_CELL}`}>
                    {c}
                  </th>
                ) : (
                  <td key={i} className={CELL}>
                    {c}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const CELL = 'border-b px-3 py-2.5 text-left align-top'
const HEAD_CELL = 'bg-muted text-foreground font-semibold whitespace-nowrap'

/**
 * 시행일 드롭다운. <details>라 스크립트 없이도 열리고 닫힌다.
 * 바깥을 누르거나 Esc를 누르면 닫히게만 더한다(PokeClip legal.js와 같다).
 */
function VersionMenu({ versions, current }: { versions: LegalVersion[]; current: string }) {
  const menu = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = menu.current
      if (el?.open && !el.contains(e.target as Node)) el.open = false
    }
    const onKey = (e: KeyboardEvent) => {
      const el = menu.current
      if (e.key !== 'Escape' || !el?.open) return
      el.open = false
      el.querySelector('summary')?.focus()
    }
    document.addEventListener('click', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const latest = versions[0]
  const shown = versions.find((v) => v.path === current) ?? latest

  return (
    <div className="mt-4">
      <details ref={menu} className="group relative inline-block">
        <summary
          aria-label={`시행일 ${shown.label} — 다른 판 보기`}
          className="bg-card focus-visible:outline-ring border-input hover:border-muted-foreground inline-flex cursor-pointer list-none items-center gap-2.5 rounded-[10px] border px-3.5 py-2.5 text-[15px] font-semibold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
        >
          {shown.label}
          <span
            aria-hidden
            className="border-x-[5px] border-t-[6px] border-x-transparent border-t-current transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <ul className="bg-popover shadow-pop absolute top-[calc(100%+6px)] left-0 z-10 m-0 max-h-80 min-w-full list-none overflow-y-auto rounded-[12px] border p-1.5">
          {versions.map((v) => (
            <li key={v.path}>
              <Link
                to={v.path}
                aria-current={v.path === shown.path ? 'page' : undefined}
                onClick={() => {
                  if (menu.current) menu.current.open = false
                }}
                className="text-muted-foreground hover:bg-muted hover:text-foreground aria-[current=page]:text-foreground flex items-center justify-between gap-3 rounded-[8px] px-2.5 py-2 text-[15px] whitespace-nowrap tabular-nums no-underline aria-[current=page]:font-semibold"
              >
                {v.label}
                {v === latest ? (
                  <span className="text-primary-text text-xs font-semibold">현재</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      </details>
      {shown !== latest ? (
        <p className="bg-accent text-foreground mt-3 mb-0 rounded-[10px] px-3.5 py-3 text-sm">
          지난 판을 보고 있어요.{' '}
          <Link to={latest.path} className="text-primary-text underline underline-offset-[0.15em]">
            현재 판 보기
          </Link>
        </p>
      ) : null}
    </div>
  )
}
