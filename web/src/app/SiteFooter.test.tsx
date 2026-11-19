import { render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import { SiteFooter } from './SiteFooter'

describe('SiteFooter', () => {
  it('상단 바와 같은 메뉴를 같은 주소로 보여 준다 (#333 리뷰)', () => {
    const router = createMemoryRouter([{ path: '/', Component: SiteFooter }])
    render(<RouterProvider router={router} />)

    const nav = screen.getByRole('navigation', { name: '바닥글' })
    const links = within(nav)
      .getAllByRole('link')
      .map((a) => [a.textContent, a.getAttribute('href')])
    expect(links).toEqual([
      ['문제', '/problems'],
      ['제출 기록', '/submissions'],
      ['내 학습', '/me/report'],
      ['요금제', '/pricing'],
    ])
  })
})
