import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import type { AdminReportDetail } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { patchReport, resetReports } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Component as AdminReportDetailPage } from './AdminReportDetailPage'

// 시드(fixtures/reports): 10 접수(두 수의 합) · 8 확인 중(탈퇴한 신고자) · 11 지워진 문제의 처리 완료 · 5 문제 삭제됨
afterEach(() => resetReports())

function renderPage(id: number | string) {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, { id: 2, nickname: '관리자', role: 'ADMIN' })
  const router = createMemoryRouter(
    [
      { path: '/admin/reports/:id', Component: AdminReportDetailPage },
      { path: '/admin/reports', element: <p>신고 목록 화면</p> },
    ],
    { initialEntries: [`/admin/reports/${id}`] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { client, router }
}

const stored = async (id: number) =>
  (await (await fetch(`/api/admin/reports/${id}`)).json()) as AdminReportDetail

const handle = () => screen.getByRole('region', { name: '처리' })

describe('AdminReportDetailPage (ADM-13)', () => {
  it('없는 신고와 첫 조회 실패도 페이지 제목(h1)을 갖는다', async () => {
    // 화면을 대신하는 안내라 h2로 두면 페이지에 h1이 없다(#315 리뷰)
    renderPage(99_999)
    expect(
      await screen.findByRole('heading', { level: 1, name: '신고를 찾을 수 없어요' }),
    ).toBeInTheDocument()
  })

  it('첫 조회가 실패하면 오류 안내가 페이지 제목(h1)이다', async () => {
    server.use(
      http.get('*/api/admin/reports/:id', () =>
        HttpResponse.json({ status: 500, title: 'Server Error' }, { status: 500 }),
      ),
    )
    renderPage(10)
    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })

  it('신고 내용을 읽기만 하게 보이고, 문제는 관리자 문제 화면으로 간다', async () => {
    renderPage(10)

    expect(await screen.findByRole('heading', { level: 1, name: '신고 #10' })).toBeInTheDocument()
    const info = screen.getByRole('region', { name: '신고 내용' })
    expect(within(info).getByRole('link', { name: '두 수의 합' })).toHaveAttribute(
      'href',
      '/admin/problems/1',
    )
    expect(info).toHaveTextContent('신고 당시 공개 버전 v1')
    expect(info).toHaveTextContent('예제 오류')
    expect(info).toHaveTextContent('코다리')
    expect(info).toHaveTextContent('예제 2의 출력이 문제 설명과 달라요.')
    expect(within(handle()).getByRole('radio', { name: /접수/ })).toBeChecked()
  })

  it('상태와 메모를 저장하면 알리고, 다시 받은 상태를 머리에 보인다', async () => {
    const user = userEvent.setup()
    renderPage(10)
    await screen.findByRole('heading', { level: 1, name: '신고 #10' })

    await user.click(within(handle()).getByRole('radio', { name: /처리 완료/ }))
    await user.type(within(handle()).getByLabelText('관리자 메모'), '  예제 2를 고쳤어요  ')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByRole('status')).toHaveTextContent('저장했어요.')
    const head = screen.getByRole('heading', { level: 1 }).parentElement!
    expect(await within(head).findByText('처리 완료')).toBeInTheDocument()
    // 서버처럼 앞뒤 공백을 떼고 저장한다
    expect(await stored(10)).toMatchObject({ status: 'RESOLVED', adminMemo: '예제 2를 고쳤어요' })
  })

  it('신고자는 회원 상세로 가는 링크다 (ADM-15)', async () => {
    renderPage(1)
    const info = await screen.findByRole('region', { name: '신고 내용' })
    expect(within(info).getByRole('link', { name: '코다리' })).toHaveAttribute(
      'href',
      '/admin/members/1',
    )
  })

  it('탈퇴한 신고자는 탈퇴한 회원으로 보인다', async () => {
    renderPage(8)
    const info = await screen.findByRole('region', { name: '신고 내용' })
    expect(within(info).getByText('탈퇴한 회원')).toHaveClass('text-muted-foreground')
  })

  it('지워진 문제의 처리 완료 신고는 처리 완료와 반려 사이만 바꿀 수 있다 (규칙 2)', async () => {
    renderPage(11)
    const info = await screen.findByRole('region', { name: '신고 내용' })

    // 문제로 가는 길이 없다. 남는 링크는 신고자(코딩왕) 하나다
    expect(
      within(info)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/admin/members/3'])
    expect(within(info).getByText('삭제된 문제')).toBeInTheDocument()
    expect(within(handle()).getByRole('radio', { name: /접수/ })).toBeDisabled()
    expect(within(handle()).getByRole('radio', { name: /확인 중/ })).toBeDisabled()
    expect(within(handle()).getByRole('radio', { name: /반려/ })).toBeEnabled()
    expect(handle()).toHaveTextContent('문제가 삭제돼서 처리 완료와 반려 사이만 바꿀 수 있어요.')
  })

  it('문제 삭제됨 신고는 상태를 고르지 않고 메모만 저장한다 (규칙 3)', async () => {
    const user = userEvent.setup()
    renderPage(5)
    await screen.findByRole('heading', { level: 1, name: '신고 #5' })

    expect(within(handle()).queryByRole('radio')).not.toBeInTheDocument()
    expect(handle()).toHaveTextContent('상태를 바꿀 수 없어요')
    const memo = within(handle()).getByLabelText('관리자 메모')
    expect(memo).toHaveValue('문제 정리하면서 삭제함.')
    await user.clear(memo)
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByRole('status')).toHaveTextContent('저장했어요.')
    // 메모를 비우면 null이다
    expect(await stored(5)).toMatchObject({ status: 'PROBLEM_DELETED', adminMemo: null })
  })

  it('저장하는 사이 문제가 지워졌으면 서버 문구를 보이고, 다시 받아 바뀐 상태로 맞춘다. 쓰던 메모는 둔다', async () => {
    const user = userEvent.setup()
    renderPage(10)
    await screen.findByRole('heading', { level: 1, name: '신고 #10' })
    await user.click(within(handle()).getByRole('radio', { name: /처리 완료/ }))
    await user.type(within(handle()).getByLabelText('관리자 메모'), '고침')
    // 다른 관리자가 문제를 지웠다 — 서버가 처리 안 한 신고를 문제 삭제됨으로 바꾼다
    patchReport(10, { problemId: null, status: 'PROBLEM_DELETED' })

    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      '삭제된 문제의 신고는 이 상태로 바꿀 수 없어요',
    )
    expect(await within(handle()).findByText('상태를 바꿀 수 없어요')).toBeInTheDocument()
    expect(within(handle()).getByLabelText('관리자 메모')).toHaveValue('고침')

    // 다시 저장하면 메모만 간다
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByRole('status')).toHaveTextContent('저장했어요.')
    expect(await stored(10)).toMatchObject({ status: 'PROBLEM_DELETED', adminMemo: '고침' })
  })

  it('메모가 1,000자를 넘으면 저장할 수 없다', async () => {
    const user = userEvent.setup()
    renderPage(10)
    await screen.findByRole('heading', { level: 1, name: '신고 #10' })

    await user.click(within(handle()).getByLabelText('관리자 메모'))
    await user.paste('가'.repeat(1001))
    expect(within(handle()).getByText('1,001 / 1,000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  // #315 리뷰: 처리 칸이 받은 값을 한 번만 복사해 서버 값과 따로 놀았다
  it('캐시에 있는 다른 신고로 옮기면 처리 칸도 그 신고의 값이다', async () => {
    const { router } = renderPage(10)
    await screen.findByRole('heading', { level: 1, name: '신고 #10' })
    await act(() => router.navigate('/admin/reports/11'))
    await screen.findByRole('heading', { level: 1, name: '신고 #11' })

    // 10은 캐시에 있어 스켈레톤 없이 바로 그린다
    await act(() => router.navigate(-1))
    await screen.findByRole('heading', { level: 1, name: '신고 #10' })
    expect(within(handle()).getByLabelText('관리자 메모')).toHaveValue('')
    expect(within(handle()).getByRole('radio', { name: /접수/ })).toBeChecked()
  })

  it('고치지 않은 칸은 다시 받은 값(다른 관리자가 저장한 값)을 따르고, 고친 칸은 둔다', async () => {
    const user = userEvent.setup()
    const { client } = renderPage(10)
    await screen.findByRole('heading', { level: 1, name: '신고 #10' })
    await user.type(within(handle()).getByLabelText('관리자 메모'), '내 메모')

    patchReport(10, { status: 'RESOLVED', adminMemo: '다른 관리자 메모' })
    await act(() => client.invalidateQueries())
    expect(await within(handle()).findByRole('radio', { name: /처리 완료/ })).toBeChecked()
    expect(within(handle()).getByLabelText('관리자 메모')).toHaveValue('내 메모')
  })

  it('받은 값이 있는데 다시 받기가 실패하면 화면을 두고 알린다 — 쓰던 메모를 잃지 않는다', async () => {
    const user = userEvent.setup()
    const { client } = renderPage(10)
    await screen.findByRole('heading', { level: 1, name: '신고 #10' })
    await user.type(within(handle()).getByLabelText('관리자 메모'), '쓰던 메모')

    server.use(
      http.get('*/api/admin/reports/:id', () =>
        HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 }),
      ),
    )
    await act(() => client.invalidateQueries())
    expect(await screen.findByText('최신 내용을 받지 못했어요')).toBeInTheDocument()
    expect(within(handle()).getByLabelText('관리자 메모')).toHaveValue('쓰던 메모')
  })

  it('저장 뒤 다시 받기가 실패해도 처리 칸은 저장한 값이다 — 저장 전 값으로 돌아가지 않는다', async () => {
    // invalidateQueries는 다시 받기가 실패해도 성공으로 끝난다. 그 뒤 칸을 비우면 저장 전 캐시가 보였다(#315 리뷰)
    const user = userEvent.setup()
    renderPage(10)
    await screen.findByRole('heading', { level: 1, name: '신고 #10' })
    await user.click(within(handle()).getByRole('radio', { name: /처리 완료/ }))
    await user.type(within(handle()).getByLabelText('관리자 메모'), ' 고침 ')
    server.use(
      http.get('*/api/admin/reports/:id', () =>
        HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 }),
      ),
    )

    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('최신 내용을 받지 못했어요')).toBeInTheDocument()
    // 서버처럼 앞뒤 공백을 뗀 값이다
    expect(within(handle()).getByLabelText('관리자 메모')).toHaveValue('고침')
    expect(within(handle()).getByRole('radio', { name: /처리 완료/ })).toBeChecked()
  })

  it('없는 신고는 찾을 수 없다고 하고 목록으로 돌려보낸다', async () => {
    renderPage(999)
    expect(await screen.findByText('신고를 찾을 수 없어요')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '신고 목록으로' })).toHaveAttribute(
      'href',
      '/admin/reports',
    )
  })
})
