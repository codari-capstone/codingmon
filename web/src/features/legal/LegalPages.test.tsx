import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentType } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { LegalDocument } from './LegalDocument'
import { effectiveDate, LEGAL_VERSIONS, type LegalDocId } from './legalInfo'
import { Component as PrivacyPage } from './PrivacyPage'
import { Component as RefundPage } from './RefundPage'
import { SignupConsent } from './SignupConsent'
import { Component as TermsPage } from './TermsPage'

const DOCS: { id: LegalDocId; path: string; title: string; Page: ComponentType }[] = [
  { id: 'terms', path: '/terms', title: '코딩몬 이용약관', Page: TermsPage },
  { id: 'privacy', path: '/privacy', title: '개인정보 처리방침', Page: PrivacyPage },
  { id: 'refund', path: '/refund', title: '환불 정책', Page: RefundPage },
]

function renderAt(path: string) {
  const router = createMemoryRouter(
    DOCS.map(({ path, Page }) => ({ path, Component: Page })),
    { initialEntries: [path] },
  )
  return render(<RouterProvider router={router} />)
}

/** 문서가 가진 절의 id. 목차와 다른 문서의 링크가 이 값을 가리킨다 */
function sectionIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll('article section[id]')].map((s) => s.id)
}

describe('약관 문서 (LEGAL-01~03)', () => {
  it.each(DOCS)(
    '$path: 제목, 현재 시행일, 목차가 보이고 목차는 모든 절을 가리킨다',
    ({ path, title, id }) => {
      const { container } = renderAt(path)

      expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
      const label = LEGAL_VERSIONS[id][0].label
      expect(screen.getByLabelText(`시행일 ${label} — 다른 판 보기`)).toBeInTheDocument()

      const toc = screen.getByRole('navigation', { name: '목차' })
      const targets = within(toc)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href'))
      expect(targets).toEqual(sectionIds(container).map((s) => `${path}#${s}`))
      // 각 절은 자기 제목(h2)으로 이름이 붙는다
      for (const s of container.querySelectorAll('article section[id]')) {
        expect(s).toHaveAccessibleName(s.querySelector('h2')!.textContent!)
      }
    },
  )

  it.each(DOCS)('$path: 본문의 시행일 문장이 드롭다운의 시행일과 같다', ({ path, id }) => {
    renderAt(path)
    expect(screen.getByText(new RegExp(`${effectiveDate(id)}부터`))).toBeInTheDocument()
  })

  it('문서끼리 거는 절 링크(/refund#outage 등)는 그 문서에 있는 절을 가리킨다', () => {
    const ids = Object.fromEntries(
      DOCS.map(({ path }) => {
        const { container, unmount } = renderAt(path)
        const found = sectionIds(container)
        unmount()
        return [path, found]
      }),
    )
    for (const { path } of DOCS) {
      const { container, unmount } = renderAt(path)
      const links = [...container.querySelectorAll('article a[href*="#"]')]
        .map((a) => a.getAttribute('href')!)
        .filter((href) => href.startsWith('/'))
      for (const href of links) {
        const [target, hash] = href.split('#')
        expect(ids[target], `${path}의 ${href}`).toContain(hash)
      }
      unmount()
    }
  })

  it('시행일 드롭다운은 현재 판에 표시를 달고, 바깥을 누르거나 Esc를 누르면 닫힌다', async () => {
    renderAt('/terms')
    const summary = screen.getByLabelText(/^시행일 .* — 다른 판 보기$/)
    const menu = summary.closest('details')!

    await userEvent.click(summary)
    expect(menu).toHaveAttribute('open')
    const current = within(menu).getByRole('link', { current: 'page' })
    expect(current).toHaveTextContent('현재')

    await userEvent.click(screen.getByRole('heading', { level: 1 }))
    expect(menu).not.toHaveAttribute('open')

    await userEvent.click(summary)
    await userEvent.keyboard('{Escape}')
    expect(menu).not.toHaveAttribute('open')
    expect(summary).toHaveFocus()
  })

  it('지난 판을 보면 현재 판으로 가는 안내가 뜬다', () => {
    const versions = [
      { label: '2027.01.01', path: '/terms' },
      { label: '2026.11.21', path: '/terms/2026-11-21' },
    ]
    const router = createMemoryRouter([
      {
        path: '/',
        element: (
          <LegalDocument
            title="이용약관"
            versions={versions}
            current="/terms/2026-11-21"
            sections={[{ id: 'a', title: '제1조', body: <p>본문</p> }]}
          />
        ),
      },
    ])
    render(<RouterProvider router={router} />)

    expect(screen.getByLabelText('시행일 2026.11.21 — 다른 판 보기')).toBeInTheDocument()
    expect(screen.getByText(/지난 판을 보고 있어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '현재 판 보기' })).toHaveAttribute('href', '/terms')
  })

  it('표는 키보드로 가로 스크롤할 수 있게 이름 붙은 영역이다', () => {
    renderAt('/privacy')
    const region = screen.getByRole('region', { name: '처리하는 개인정보 항목' })
    expect(region).toHaveAttribute('tabindex', '0')
    expect(within(region).getByRole('table')).toBeInTheDocument()
  })
})

describe('SignupConsent (LEGAL-04)', () => {
  it('이용약관과 처리방침을 새 탭으로 연다 — 같은 탭이면 입력한 가입 정보가 사라진다', () => {
    const router = createMemoryRouter([{ path: '/', Component: SignupConsent }])
    render(<RouterProvider router={router} />)

    for (const [name, href] of [
      ['이용약관', '/terms'],
      ['개인정보 처리방침', '/privacy'],
    ]) {
      const link = screen.getByRole('link', { name })
      expect(link).toHaveAttribute('href', href)
      expect(link).toHaveAttribute('target', '_blank')
    }
  })
})
