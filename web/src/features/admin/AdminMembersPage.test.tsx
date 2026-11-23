import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { Subscription } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { server } from '@/mocks/server'
import { Component as AdminMembersPage } from './AdminMembersPage'

// 닉네임 칸 글은 아바타의 첫 글자가 앞에 붙는다(코코린이).
// 시드 회원 24명: 정지 2(3 코딩왕·8 밤샘코더), 관리자 2번, 가입일 없음 1~4, GitHub 6·10·16 (fixtures/adminUsers)
// 대시보드 카드로 들어온 것처럼 대시보드를 앞 기록으로 둔다
function renderPage(entry = '/admin/members') {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, { id: 2, nickname: '관리자', role: 'ADMIN' })
  const router = createMemoryRouter(
    [
      { path: '/admin/members', Component: AdminMembersPage },
      { path: '/admin/dashboard', element: <p>대시보드 화면</p> },
    ],
    { initialEntries: ['/admin/dashboard', entry], initialIndex: 1 },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

/** 취소·확인이 필요한 결제가 있는 회원 하나(코딩왕, 정상·프로 연간) */
const needsCancelMember = {
  id: 3,
  nickname: '코딩왕',
  email: 'king@example.com',
  role: 'USER',
  createdAt: null,
  suspendedAt: null,
  subscription: {
    plan: 'PRO',
    status: 'ACTIVE',
    cycle: 'YEARLY',
    nextCycle: null,
    currentPeriodEnd: '2027-10-20T03:00:00Z',
    customerId: null,
    paymentPending: false,
  },
}

const firstCells = async () =>
  (await screen.findAllByRole('row'))
    .slice(1)
    .map((row) => (row as HTMLTableRowElement).cells[0]?.textContent)

const tabTexts = () =>
  within(screen.getByRole('tablist', { name: '회원 상태' }))
    .getAllByRole('tab')
    .map((tab) => tab.textContent)

describe('AdminMembersPage (ADM-14)', () => {
  it('탭 개수와 최근 가입한 회원부터 20명을 보인다', async () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: '회원' })).toBeInTheDocument()
    expect(await firstCells()).toHaveLength(20)
    expect(tabTexts()).toEqual(['전체24', '정상22', '정지2'])
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent(/^24코코린이newbie@example\.com\d{4}-\d{2}-\d{2}무료—정상$/)
    // GitHub로 가입한 회원은 이메일 대신 '(GitHub)'
    expect(rows[9]).toHaveTextContent(/^16큐큐대기열\(GitHub\)/)
    // 아바타는 장식이다. 이름 옆이라 그림으로도 읽히면 줄마다 이름이 두 번 들린다
    expect(within(rows[1]!).queryByRole('img')).not.toBeInTheDocument()
    expect(within(rows[1]!).getByRole('link', { name: '코린이' })).toHaveAttribute(
      'href',
      '/admin/members/24',
    )
  })

  it('다음 페이지에서 가입일 없는 회원은 —, 관리자에는 배지, 정지 회원은 정지로 보인다', async () => {
    const user = userEvent.setup()
    renderPage()
    await firstCells()

    await user.click(screen.getByRole('button', { name: '2페이지' }))
    expect(await screen.findByText('king@example.com')).toBeInTheDocument()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([
      '4알알고펭algo.peng@example.com—무료—정상',
      '3코코딩왕king@example.com—무료—정지',
      '2관관리자관리자admin@codari.test—무료—정상',
      '1코코다리user@codari.test—무료—정상',
    ])
  })

  it('정지 탭은 정지된 회원만 보인다', async () => {
    const user = userEvent.setup()
    renderPage()
    await firstCells()

    await user.click(screen.getByRole('tab', { name: '정지2' }))
    expect(await screen.findByText('nightowl@example.com')).toBeInTheDocument()
    expect(await firstCells()).toEqual(['8', '3'])
    expect(screen.queryByRole('button', { name: '2페이지' })).not.toBeInTheDocument()
  })

  it('숫자로 찾으면 그 ID의 회원이 나오고 탭 개수도 검색 결과로 바뀐다', async () => {
    const user = userEvent.setup()
    renderPage()
    await firstCells()

    await user.type(screen.getByRole('searchbox', { name: '이메일 · 닉네임 · ID로 검색' }), ' 3 ')
    expect(await screen.findByRole('tab', { name: '전체1' })).toBeInTheDocument()
    expect(tabTexts()).toEqual(['전체1', '정상0', '정지1'])
    expect(await firstCells()).toEqual(['3'])
  })

  it('맞는 회원이 없으면 그렇게 말한다', async () => {
    const user = userEvent.setup()
    renderPage()
    await firstCells()

    await user.type(
      screen.getByRole('searchbox', { name: '이메일 · 닉네임 · ID로 검색' }),
      '없는사람',
    )
    expect(await screen.findByText('조건에 맞는 회원이 없어요')).toBeInTheDocument()
    // 가리킬 '—'가 없으니 가입일 안내도 달지 않는다(#316 리뷰)
    expect(screen.queryByText(/가입일이 '—'인 회원은/)).not.toBeInTheDocument()
  })

  it('요금제는 플랜·주기와 해지 예정·결제 실패 배지로, 마감일은 이번 기간 끝나는 날로 보인다', async () => {
    const sub = (s: Partial<Subscription>): Subscription => ({
      plan: 'FREE',
      status: 'NONE',
      cycle: null,
      nextCycle: null,
      currentPeriodEnd: null,
      customerId: null,
      paymentPending: false,
      ...s,
    })
    const member = (id: number, subscription: Subscription) => ({
      id,
      nickname: `회원${id}`,
      email: `m${id}@example.com`,
      role: 'USER',
      createdAt: null,
      suspendedAt: null,
      subscription,
    })
    server.use(
      http.get('*/api/admin/users', () =>
        HttpResponse.json({
          content: [
            member(4, sub({ status: 'PAYMENT_FAILED', cycle: 'MONTHLY' })),
            member(3, {
              ...sub({ plan: 'PRO', status: 'CANCEL_SCHEDULED', cycle: 'MONTHLY' }),
              currentPeriodEnd: '2026-11-30T03:00:00Z',
            }),
            member(2, {
              ...sub({ plan: 'PRO', status: 'ACTIVE', cycle: 'YEARLY' }),
              currentPeriodEnd: '2027-09-14T03:00:00Z',
            }),
            member(1, sub({})),
          ],
          totalElements: 4,
          counts: { all: 4, active: 4, suspended: 0 },
        }),
      ),
    )
    renderPage()

    await firstCells()
    expect(screen.getAllByRole('row').map((row) => row.textContent)).toEqual([
      'ID닉네임이메일가입일요금제마감일상태',
      '4회회원4m4@example.com—프로 월간결제 실패—정상',
      '3회회원3m3@example.com—프로 월간해지 예정2026-11-30정상',
      '2회회원2m2@example.com—프로 연간2027-09-14정상',
      '1회회원1m1@example.com—무료—정상',
    ])
    expect(screen.getByText(/마감일은 진행 중이면 다음 결제일/)).toBeInTheDocument()
  })

  it('대시보드 카드에서 들어오면 취소·확인이 필요한 회원만 보이고, ×로 필터를 지워도 기록은 쌓지 않는다', async () => {
    const user = userEvent.setup()
    const asked: (string | null)[] = []
    server.use(
      http.get('*/api/admin/users', ({ request }) => {
        const needsCancel = new URL(request.url).searchParams.get('paymentNeedsCancel')
        asked.push(needsCancel)
        if (needsCancel !== 'true') return undefined
        return HttpResponse.json({
          content: [needsCancelMember],
          totalElements: 1,
          counts: { all: 1, active: 1, suspended: 0 },
        })
      }),
    )
    const router = renderPage('/admin/members?paymentNeedsCancel=true')

    expect(await firstCells()).toEqual(['3'])
    expect(asked[0]).toBe('true')
    expect(screen.getByText('취소·확인이 필요한 결제만')).toHaveTextContent(
      '취소·확인이 필요한 결제만 · 1명',
    )
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('프로 연간취소·확인 필요')

    await user.click(screen.getByRole('button', { name: '취소·확인이 필요한 결제 필터 지우기' }))
    expect(await screen.findByRole('tab', { name: '전체24' })).toBeInTheDocument()
    expect(asked.at(-1)).toBeNull()
    expect(screen.queryByText(/취소·확인이 필요한 결제만/)).not.toBeInTheDocument()
    expect(screen.queryByText('취소·확인 필요')).not.toBeInTheDocument()

    // 뒤로 가면 필터 목록이 아니라 들어온 대시보드로 간다
    await router.navigate(-1)
    expect(await screen.findByText('대시보드 화면')).toBeInTheDocument()
  })

  it('대상 회원은 있는데 고른 탭에만 없으면 탭 기준으로 안내한다', async () => {
    const user = userEvent.setup()
    server.use(
      http.get('*/api/admin/users', ({ request }) => {
        const status = new URL(request.url).searchParams.get('status')
        return HttpResponse.json({
          content: status === 'SUSPENDED' ? [] : [needsCancelMember],
          totalElements: status === 'SUSPENDED' ? 0 : 1,
          counts: { all: 1, active: 1, suspended: 0 },
        })
      }),
    )
    renderPage('/admin/members?paymentNeedsCancel=true')
    await firstCells()

    await user.click(screen.getByRole('tab', { name: '정지0' }))
    expect(await screen.findByText('정지된 회원이 없어요')).toBeInTheDocument()
    expect(screen.queryByText(/결제가 있는 회원이 없어요/)).not.toBeInTheDocument()
  })

  it('대상 회원이 하나도 없으면 그렇게 말한다', async () => {
    server.use(
      http.get('*/api/admin/users', () =>
        HttpResponse.json({
          content: [],
          totalElements: 0,
          counts: { all: 0, active: 0, suspended: 0 },
        }),
      ),
    )
    renderPage('/admin/members?paymentNeedsCancel=true')

    expect(
      await screen.findByText('취소·확인이 필요한 결제가 있는 회원이 없어요'),
    ).toBeInTheDocument()
  })

  it('가입일 안내는 표가 있을 때만 단다', async () => {
    renderPage()
    expect(screen.queryByText(/가입일이 '—'인 회원은/)).not.toBeInTheDocument()
    await firstCells()
    expect(screen.getByText(/가입일이 '—'인 회원은/)).toBeInTheDocument()
  })
})
