import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { BUSINESS_REGISTERED } from '@/features/legal/legalInfo'
import { SiteFooter } from './SiteFooter'

function renderFooter() {
  const router = createMemoryRouter([{ path: '/', Component: SiteFooter }])
  render(<RouterProvider router={router} />)
}

describe('SiteFooter', () => {
  it('상단 바와 같은 메뉴 뒤에 약관 링크를 같은 주소로 보여 준다 (#333 리뷰, #335)', () => {
    renderFooter()

    const nav = screen.getByRole('navigation', { name: '바닥글' })
    const links = within(nav)
      .getAllByRole('link')
      .map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['문제', '/problems'],
      ['제출 기록', '/submissions'],
      ['내 학습', '/me/report'],
      ['요금제', '/pricing'],
      ['이용약관', '/terms'],
      ['개인정보 처리방침', '/privacy'],
      ['환불 정책', '/refund'],
    ])
    // 처리방침은 다른 링크와 구분되게 굵게 (개인정보위 작성지침)
    expect(within(nav).getByRole('link', { name: '개인정보 처리방침' })).toHaveClass('font-bold')
  })

  it('아래 줄에 운영·문의·저작권을 보여 준다 (PokeClip 바닥글과 같은 구성)', () => {
    renderFooter()
    expect(screen.getByText('운영 Codari 팀')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'contact@codingmon.tech' })).toHaveAttribute(
      'href',
      'mailto:contact@codingmon.tech',
    )
    expect(screen.getByText('© 2026 Codari')).toBeInTheDocument()
  })

  it('사업자 등록 전에는 자리표시뿐인 사업자 정보 줄을 두지 않는다 (전자상거래법 제10조)', () => {
    renderFooter()
    // 등록하면(사업자등록번호를 채우면) 이 줄이 나온다. 그때는 이 기대를 뒤집는다
    expect(BUSINESS_REGISTERED).toBe(false)
    expect(screen.queryByText(/사업자등록번호/)).not.toBeInTheDocument()
  })
})
