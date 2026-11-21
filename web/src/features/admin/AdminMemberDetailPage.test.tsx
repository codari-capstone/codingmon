import { focusManager, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import type { AdminReportDetail } from '@/api/types'
import { resetAdminUsers, resetReports } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Component as AdminMemberDetailPage } from './AdminMemberDetailPage'

const unauthorized = () => HttpResponse.json({ status: 401 }, { status: 401 })

// 시드(fixtures/adminUsers): 1 코다리(정상, 제출 92·푼 문제 12), 2 관리자, 3 코딩왕(50시간 전 정지·사유 있음),
// 8 밤샘코더(2시간 전 정지). 제출·푼 문제는 1·3만 있다
afterEach(() => {
  resetAdminUsers()
  resetReports()
})

function renderPage(id: number | string) {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, { id: 2, nickname: '관리자', role: 'ADMIN' })
  const router = createMemoryRouter(
    [
      { path: '/admin/members/:id', Component: AdminMemberDetailPage },
      { path: '/admin/members', element: <h1>회원 목록 화면</h1> },
    ],
    { initialEntries: [`/admin/members/${id}`] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { client, router }
}

describe('AdminMemberDetailPage (ADM-15·16)', () => {
  it('관리자 회원은 막대 대신 쓴 횟수와 한도 없음을 보인다 (#343)', async () => {
    renderPage(2)

    expect(await screen.findByText('관리자라 하루 한도가 없어요')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar', { name: 'AI 분석·리뷰' })).not.toBeInTheDocument()
  })

  it('기본 정보, 오늘 AI 사용, 푼 문제, 제출 목록을 보인다', async () => {
    renderPage(1)

    expect(await screen.findByRole('heading', { level: 1, name: '코다리' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '현재 위치' })).toHaveTextContent('회원코다리')
    expect(screen.getByText('— (기록 전 가입)')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'AI 분석·리뷰' })).toHaveAttribute(
      'aria-valuemax',
      '20',
    )
    expect(screen.getByText(/하루 한도 20회 · 오전 9시에 다시 채워져요/)).toBeInTheDocument()

    const solved = screen.getByRole('region', { name: '푼 문제' })
    expect(await within(solved).findByText('12개')).toBeInTheDocument()
    expect(within(solved).getByRole('cell', { name: '역방향 피라미드' })).toBeInTheDocument()

    const submissions = screen.getByRole('region', { name: '제출 목록' })
    expect(await within(submissions).findByText('총 92개')).toBeInTheDocument()
    expect(within(submissions).getAllByRole('row')).toHaveLength(21)
    expect(within(submissions).getByRole('button', { name: '5페이지' })).toBeInTheDocument()

    // 정상 회원이라 정지만 할 수 있다
    expect(screen.getByRole('button', { name: '계정 정지' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '강제 탈퇴' })).not.toBeInTheDocument()
  })

  it('제출을 펼치면 코드와 결과·시간·메모리가 보이고, 다시 누르면 접힌다', async () => {
    const user = userEvent.setup()
    renderPage(1)
    const submissions = await screen.findByRole('region', { name: '제출 목록' })
    const open = await within(submissions).findByRole('button', {
      name: '코드와 결과 보기: 제출 #1193',
    })

    await user.click(open)
    expect(await within(submissions).findByText('script.py')).toBeInTheDocument()
    expect(within(submissions).getByText('100ms')).toBeInTheDocument()
    expect(within(submissions).getByText('30,000KB')).toBeInTheDocument()

    await user.click(within(submissions).getByRole('button', { name: '접기: 제출 #1193' }))
    expect(within(submissions).queryByText('script.py')).not.toBeInTheDocument()
  })

  it('사유를 적어 정지하면 배너와 해제 버튼이 보이고, 강제 탈퇴는 24시간 뒤까지 꺼져 있다', async () => {
    const user = userEvent.setup()
    renderPage(1)
    await user.click(await screen.findByRole('button', { name: '계정 정지' }))

    const dialog = screen.getByRole('dialog', { name: "'코다리' 계정을 정지할까요?" })
    await user.type(within(dialog).getByLabelText(/정지 사유/), '  욕설 반복  ')
    await user.click(within(dialog).getByRole('button', { name: '정지하기' }))

    expect(await screen.findByText('계정을 정지했어요.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByText('정지된 계정이에요')).toBeInTheDocument()
    // 서버처럼 앞뒤 공백을 뗀 사유가 돌아온다
    expect(screen.getByText('사유: 욕설 반복')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '정지 해제' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '강제 탈퇴' })).toBeDisabled()
    expect(screen.getByText(/정지 24시간 뒤에 할 수 있어요 · 24시간 남음/)).toBeInTheDocument()
  })

  it('정지 사유가 1,000자를 넘으면 정지하기를 막는다', async () => {
    const user = userEvent.setup()
    renderPage(1)
    await user.click(await screen.findByRole('button', { name: '계정 정지' }))
    const dialog = screen.getByRole('dialog')
    const reason = within(dialog).getByLabelText(/정지 사유/)

    await user.click(reason)
    await user.paste('가'.repeat(1001))
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByRole('button', { name: '정지하기' })).toBeDisabled()
  })

  it('정지 창에서 실패한 뒤 닫으면 같은 오류를 창 밖에 다시 띄우지 않는다', async () => {
    const user = userEvent.setup()
    server.use(
      http.post('*/api/admin/users/1/suspend', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    )
    renderPage(1)
    await user.click(await screen.findByRole('button', { name: '계정 정지' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '정지하기' }))
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('정지는 됐는데 상세를 다시 받지 못하면, 화면이 낡았을 수 있다고 알리고 다시 받을 길을 준다', async () => {
    const user = userEvent.setup()
    let failing = false
    server.use(
      http.get('*/api/admin/users/1', () =>
        failing
          ? HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 })
          : undefined,
      ),
    )
    renderPage(1)
    await user.click(await screen.findByRole('button', { name: '계정 정지' }))
    failing = true
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '정지하기' }))

    // retry: 1이라 오류 상태가 1초 뒤에 온다
    expect(
      await screen.findByText('최신 정보를 받지 못했어요', {}, { timeout: 3000 }),
    ).toBeInTheDocument()
    failing = false
    await user.click(screen.getByRole('button', { name: '다시 받기' }))
    expect(await screen.findByText('정지된 계정이에요')).toBeInTheDocument()
    expect(screen.queryByText('최신 정보를 받지 못했어요')).not.toBeInTheDocument()
  })

  it('서버 시계가 브라우저보다 빨라도 남은 시간은 24시간을 넘지 않는다', async () => {
    server.use(
      http.get('*/api/admin/users/8', () =>
        HttpResponse.json({
          id: 8,
          nickname: '밤샘코더',
          email: 'nightowl@example.com',
          role: 'USER',
          createdAt: null,
          // 서버가 5초 앞서 정지 시각을 찍었다
          suspendedAt: new Date(Date.now() + 5_000).toISOString(),
          loginMethod: 'EMAIL',
          suspensionReason: null,
          aiQuota: { limit: 20, used: 0, remaining: 20, resetsAt: '2026-11-18T00:00:00Z' },
        }),
      ),
    )
    renderPage(8)
    expect(
      await screen.findByText(/정지 24시간 뒤에 할 수 있어요 · 24시간 남음/),
    ).toBeInTheDocument()
  })

  // 버튼이 다른 요소로 갈아끼워지지 않는지 본다. 처리 중 disabled로 포커스를 잃는 것은 jsdom이 흉내 내지
  // 않아 e2e(admin.spec.ts)가 본다
  it('정지·해제 뒤에도 키보드 포커스가 같은 자리의 버튼에 남는다', async () => {
    const user = userEvent.setup()
    renderPage(1)
    await user.click(await screen.findByRole('button', { name: '계정 정지' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '정지하기' }))

    // 창이 닫히며 [계정 정지]로 돌아온 포커스가, 다시 받은 뒤 [정지 해제]가 된 같은 버튼에 남는다
    const unsuspend = await screen.findByRole('button', { name: '정지 해제' })
    expect(unsuspend).toHaveFocus()

    await user.keyboard('{Enter}')
    const suspend = await screen.findByRole('button', { name: '계정 정지' })
    expect(suspend).toHaveFocus()
  })

  it('정지 사유에 널 문자가 있으면 알려 주고 정지하기를 막는다 — 목도 서버처럼 code 없는 400', async () => {
    const user = userEvent.setup()
    renderPage(1)
    await user.click(await screen.findByRole('button', { name: '계정 정지' }))
    const dialog = screen.getByRole('dialog')
    const reason = within(dialog).getByLabelText(/정지 사유/)

    await user.click(reason)
    await user.paste('욕설\0반복')
    expect(within(dialog).getByText(/널 문자/)).toBeInTheDocument()
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByRole('button', { name: '정지하기' })).toBeDisabled()

    const response = await fetch('/api/admin/users/1/suspend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason: '욕설\0반복' }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).not.toHaveProperty('code')
  })

  it('처리 중에는 버튼을 disabled로 두지 않고(포커스 유지) 글자와 aria-busy로 알린다', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('*/api/admin/users/3/unsuspend', async () => {
        await held
        return undefined
      }),
    )
    renderPage(3)
    await user.click(await screen.findByRole('button', { name: '정지 해제' }))

    const busy = await screen.findByRole('button', { name: '해제하는 중…' })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).toHaveAttribute('aria-disabled', 'true')
    expect(busy).toBeEnabled()
    expect(busy).toHaveFocus()
    // 강제 탈퇴도 처리 중 disabled가 아니다. 확인 창이 닫히며 돌아오는 포커스를 받아야 한다
    const withdraw = screen.getByRole('button', { name: '강제 탈퇴' })
    expect(withdraw).toBeEnabled()
    expect(withdraw).toHaveAttribute('aria-disabled', 'true')

    release()
    expect(await screen.findByRole('button', { name: '계정 정지' })).toHaveFocus()
  })

  it('정지 창의 버튼도 처리 중 disabled가 아니라 포커스가 창 안에 남는다', async () => {
    // disabled가 되면 브라우저가 포커스를 body로 옮겨, 실패했을 때 포커스가 창 밖에 있다(#319 리뷰)
    const user = userEvent.setup()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('*/api/admin/users/1/suspend', async () => {
        await held
        return HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 })
      }),
    )
    renderPage(1)
    await user.click(await screen.findByRole('button', { name: '계정 정지' }))
    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: '정지하기' }))

    const busy = within(dialog).getByRole('button', { name: '정지하는 중…' })
    expect(busy).toBeEnabled()
    expect(busy).toHaveAttribute('aria-disabled', 'true')
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).toHaveFocus()
    const cancel = within(dialog).getByRole('button', { name: '취소' })
    expect(cancel).toBeEnabled()
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    // 처리 중 [취소]는 창을 닫지 않는다
    await user.click(cancel)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    release()
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    // 실패해도 포커스는 창 안([취소])에 남는다
    expect(cancel).toHaveFocus()
  })

  it('강제 탈퇴 처리 중에는 버튼이 포커스를 받고, 다시 눌러도 확인 창을 열지 않는다', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.delete('*/api/admin/users/3', async () => {
        await held
        return HttpResponse.json(
          { status: 409, title: 'Conflict', code: 'USER_NOT_SUSPENDED', detail: '거절' },
          { status: 409 },
        )
      }),
    )
    renderPage(3)
    await screen.findByText('총 92개')
    await user.click(screen.getByRole('button', { name: '강제 탈퇴' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '강제 탈퇴' }),
    )

    // 창이 닫히며 포커스가 트리거로 돌아온다. disabled면 받지 못하고 body로 떨어진다
    const busy = await screen.findByRole('button', { name: '탈퇴시키는 중…' })
    expect(busy).toBeEnabled()
    await waitFor(() => expect(busy).toHaveFocus())
    await user.click(busy)
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()

    release()
    expect(await screen.findByRole('alert')).toHaveTextContent('거절')
  })

  it('제출 카드가 다른 페이지에 있어도, 다시 받은 제출 1페이지가 401이면 세션을 버린다', async () => {
    const user = userEvent.setup()
    let firstPageFails = false
    server.use(
      http.get('*/api/admin/users/1/submissions', ({ request }) =>
        firstPageFails && new URL(request.url).searchParams.get('page') === '0'
          ? unauthorized()
          : undefined,
      ),
    )
    const { client } = renderPage(1)
    const submissions = await screen.findByRole('region', { name: '제출 목록' })
    await user.click(await within(submissions).findByRole('button', { name: '2페이지' }))
    await within(submissions).findByText('#1144')

    firstPageFails = true
    await user.click(screen.getByRole('button', { name: '계정 정지' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '정지하기' }))
    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull(), { timeout: 3000 })
  })

  it('상세가 500이어도 푼 문제가 401이면 세션을 버린다', async () => {
    // ??로 이으면 상세의 500에 가려 뒤의 401을 보지 못한다(#318 리뷰)
    server.use(
      http.get('*/api/admin/users/1', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
      http.get('*/api/admin/users/1/solved-problems', unauthorized),
    )
    const { client } = renderPage(1)
    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull(), { timeout: 4000 })
  })

  it('정지를 풀면 정상으로 돌아온다', async () => {
    const user = userEvent.setup()
    renderPage(8)
    await user.click(await screen.findByRole('button', { name: '정지 해제' }))

    expect(await screen.findByText('정지를 풀었어요.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: '계정 정지' })).toBeInTheDocument()
    expect(screen.queryByText('정지된 계정이에요')).not.toBeInTheDocument()
  })

  it('정지하고 24시간이 지났으면 경고 창을 거쳐 강제 탈퇴하고 목록으로 간다', async () => {
    const user = userEvent.setup()
    const { router } = renderPage(3)
    expect(await screen.findByText('사유: 다른 사람의 풀이를 그대로 제출함')).toBeInTheDocument()
    expect(screen.getByText(/24시간이 지나 강제 탈퇴할 수 있어요/)).toBeInTheDocument()
    await screen.findByText('총 92개')

    await user.click(screen.getByRole('button', { name: '강제 탈퇴' }))
    const dialog = screen.getByRole('alertdialog', { name: "'코딩왕' 계정을 강제 탈퇴할까요?" })
    expect(dialog).toHaveTextContent('해당 회원의 모든 정보가 지워집니다')
    expect(dialog).toHaveTextContent('지워질 제출92개')
    expect(dialog).toHaveTextContent('지워질 푼 문제12개')
    await user.click(within(dialog).getByRole('button', { name: '강제 탈퇴' }))

    expect(await screen.findByRole('heading', { name: '회원 목록 화면' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/admin/members')
    // 보낸 신고는 남고 신고자 칸만 빈다(계약). 21번은 코딩왕(3)이 보낸 신고다(fixtures/reports)
    const report = (await (await fetch('/api/admin/reports/21')).json()) as AdminReportDetail
    expect(report).toMatchObject({ id: 21, reporterId: null, reporterNickname: null })
    expect(await (await fetch('/api/admin/users/3')).json()).toMatchObject({
      code: 'USER_NOT_FOUND',
    })
  })

  it('강제 탈퇴가 거절되면 서버 문구를 보이고 상세를 다시 받는다', async () => {
    const user = userEvent.setup()
    let detailCalls = 0
    server.use(
      http.get('*/api/admin/users/3', () => {
        detailCalls += 1
        return undefined
      }),
      http.delete('*/api/admin/users/3', () =>
        HttpResponse.json(
          {
            status: 409,
            title: 'Conflict',
            code: 'USER_NOT_SUSPENDED',
            detail: '정지된 회원만 강제 탈퇴할 수 있어요',
          },
          { status: 409 },
        ),
      ),
    )
    renderPage(3)
    await screen.findByText('총 92개')
    await user.click(await screen.findByRole('button', { name: '강제 탈퇴' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: '강제 탈퇴' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '정지된 회원만 강제 탈퇴할 수 있어요',
    )
    await vi.waitFor(() => expect(detailCalls).toBe(2))
  })

  it('정지한 지 24시간이 안 됐으면 배너에 강제 탈퇴 안내가 없고, 사유가 없으면 사유 줄도 없다', async () => {
    renderPage(8)
    expect(await screen.findByText('정지된 계정이에요')).toBeInTheDocument()
    expect(screen.queryByText(/24시간이 지나 강제 탈퇴할 수 있어요/)).not.toBeInTheDocument()
    expect(screen.queryByText(/^사유:/)).not.toBeInTheDocument()
  })

  it('올해가 아닌 정지 시각·처음 푼 날에는 연도를 붙인다', async () => {
    server.use(
      http.get('*/api/admin/users/1', () =>
        HttpResponse.json({
          id: 1,
          nickname: '코다리',
          email: 'user@codari.test',
          role: 'USER',
          createdAt: null,
          suspendedAt: '2020-12-30T01:00:00Z',
          loginMethod: 'EMAIL',
          suspensionReason: null,
          aiQuota: { limit: 20, used: 0, remaining: 20, resetsAt: '2026-11-18T00:00:00Z' },
        }),
      ),
      http.get('*/api/admin/users/1/solved-problems', () =>
        HttpResponse.json([
          { problemId: 1, title: 'A+B', firstSolvedAt: '2020-12-30T01:00:00Z', attemptCount: 1 },
        ]),
      ),
    )
    renderPage(1)
    expect(await screen.findByText(/2020년 12월 30일 10:00에 정지했어요/)).toBeInTheDocument()
    const solved = await screen.findByRole('region', { name: '푼 문제' })
    expect(
      await within(solved).findByRole('cell', { name: '2020년 12월 30일' }),
    ).toBeInTheDocument()
  })

  it('탭에 돌아오면 상세를 다시 받는다 — 앱 기본값은 다시 받지 않는다', async () => {
    let calls = 0
    server.use(
      http.get('*/api/admin/users/1', () => {
        calls += 1
        return undefined
      }),
    )
    renderPage(1)
    await screen.findByRole('heading', { level: 1, name: '코다리' })
    expect(calls).toBe(1)

    // staleTime(30초)이 지나야 다시 받는다. 시계만 앞당긴다
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(Date.now() + 31_000)
      act(() => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
      })
      await waitFor(() => expect(calls).toBe(2))
    } finally {
      vi.useRealTimers()
      focusManager.setFocused(undefined)
    }
  })

  it.each([
    ['푼 문제', '*/api/admin/users/1/solved-problems'],
    ['제출 목록', '*/api/admin/users/1/submissions'],
  ])('%s 조회가 401이면 세션을 버려 로그인 화면으로 보낼 수 있게 한다', async (_name, path) => {
    server.use(http.get(path, unauthorized))
    const { client } = renderPage(1)
    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull(), { timeout: 3000 })
  })

  it('펼친 제출이 401이면 세션을 버린다', async () => {
    const user = userEvent.setup()
    server.use(http.get('*/api/admin/submissions/:id', unauthorized))
    const { client } = renderPage(1)
    await user.click(await screen.findByRole('button', { name: '코드와 결과 보기: 제출 #1193' }))
    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull(), { timeout: 3000 })
  })

  it('관리자 계정에는 정지·탈퇴 버튼이 없다', async () => {
    renderPage(2)
    expect(await screen.findByRole('heading', { level: 1, name: '관리자' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '계정 정지' })).not.toBeInTheDocument()
    expect(await screen.findByText('아직 제출이 없어요.')).toBeInTheDocument()
    expect(await screen.findByText('아직 맞힌 문제가 없어요.')).toBeInTheDocument()
  })

  it('없는 회원이면 목록으로 돌아갈 길을 준다', async () => {
    renderPage(999)
    expect(await screen.findByText('회원을 찾을 수 없어요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '회원 목록으로' })).toHaveAttribute(
      'href',
      '/admin/members',
    )
  })
})
