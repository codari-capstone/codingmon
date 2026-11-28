import { QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { SubmissionCodeReview } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { Component as SubmissionResultPage } from '@/features/result/SubmissionResultPage'
import { resetSubmissions } from '@/mocks/handlers'
import { server } from '@/mocks/server'

/** 목 fixture의 지난 제출 (mocks/fixtures/history.ts). 11은 맞았습니다, 23은 틀렸습니다다. */
const ACCEPTED = 11
const WRONG = 23

const QUOTA = {
  plan: 'FREE' as const,
  limit: 20,
  used: 1,
  remaining: 19,
  resetsAt: '2026-11-08T00:00:00Z',
}

function renderResult(id: number) {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, { id: 1, nickname: '코다리', role: 'USER' })
  const router = createMemoryRouter(
    [{ path: '/submissions/:id', Component: SubmissionResultPage }],
    {
      initialEntries: [`/submissions/${id}`],
    },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
}

function review(over: Partial<SubmissionCodeReview> = {}): SubmissionCodeReview {
  return {
    submissionId: ACCEPTED,
    status: 'COMPLETED',
    failureReason: null,
    blocked: false,
    summary: '리뷰 요약',
    complexity: {
      basis: '근거 문장',
      time: 'O(n^2)',
      space: 'O(n)',
      intendedTime: 'O(n)',
      comparison: '비교 문장',
      meetsIntended: false,
    },
    improvements: ['개선점 하나'],
    nextConcepts: [{ name: '누적합', reason: '배울 이유' }],
    createdAt: '2026-11-07T00:00:00Z',
    completedAt: '2026-11-07T00:00:05Z',
    quota: QUOTA,
    ...over,
  }
}

const EMPTY = { summary: null, complexity: null, improvements: [], nextConcepts: [] }

function stored(value: SubmissionCodeReview) {
  server.use(http.get('*/api/submissions/:id/code-review', () => HttpResponse.json(value)))
}

describe('CodeReviewPanel (AI-05)', () => {
  // 목의 남은 횟수 조회는 토큰을 보는데 이 테스트는 토큰 없이 그린다
  beforeEach(() => {
    server.use(http.get('*/api/users/me/ai-quota', () => HttpResponse.json(QUOTA)))
  })
  afterEach(() => resetSubmissions())

  it('오답이면 리뷰 패널이 없다', async () => {
    renderResult(WRONG)
    await screen.findByText('틀렸습니다')
    expect(screen.queryByRole('heading', { name: 'AI 리뷰' })).not.toBeInTheDocument()
  })

  it('누르면 만드는 동안 안내하고, 끝나면 복잡도·개선점·다음 개념을 보여 준다', async () => {
    const user = userEvent.setup()
    renderResult(ACCEPTED)

    expect(await screen.findByText('오늘 남은 AI 분석·리뷰 19 / 20회')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'AI 리뷰' }))

    // 목은 요청에 PENDING을 주고 다음 조회에 끝낸다 (handlers.ts)
    expect(await screen.findByText('AI가 코드를 리뷰하고 있어요…')).toBeInTheDocument()
    // 기다리는 동안 달리는 펭귄. 안내는 패널의 status 문구가 하므로 낭독기에는 숨긴다
    expect(document.querySelector('[data-slot="loading-state"]')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(
      await screen.findByText(/필요한 일만 하는 깔끔한 풀이예요/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(document.querySelector('[data-slot="loading-state"]')).not.toBeInTheDocument()
    // 시간·의도한 시간. 공간은 목이 넘침 검사용 긴 값을 준다(handlers.ts)
    expect(screen.getAllByText('O(1)')).toHaveLength(2)
    expect(screen.getByText('의도한 만큼 빨라요')).toBeInTheDocument()
    expect(screen.getByText('입출력 최적화')).toBeInTheDocument()
    // 끝난 리뷰는 다시 만들지 않는다(계약)
    expect(screen.queryByRole('button', { name: /AI 리뷰|다시 시도/ })).not.toBeInTheDocument()
  })

  it('의도보다 느리면 그렇다고 알리고, 문장은 글자 그대로 보여 준다', async () => {
    stored(review({ summary: '<b>굵게</b>' }))
    renderResult(ACCEPTED)

    expect(await screen.findByText('<b>굵게</b>')).toBeInTheDocument()
    expect(screen.getByText('더 줄일 수 있어요')).toBeInTheDocument()
    expect(screen.getByText('비교 문장')).toBeInTheDocument()
    expect(screen.getByText('개선점 하나')).toBeInTheDocument()
    expect(screen.getByText('배울 이유')).toBeInTheDocument()
  })

  it('근거 글은 제목이 있는 별도 섹션이다', async () => {
    stored(review())
    renderResult(ACCEPTED)

    const heading = await screen.findByRole('heading', { name: '왜 이런 복잡도인가요?' })
    expect(heading.parentElement).toHaveTextContent('근거 문장')
    expect(heading.parentElement).not.toHaveTextContent('비교 문장')
  })

  it.each([
    ['시간 설명', '입력이 커질 때 실행 시간이 얼마나 늘어나는지예요.'],
    ['공간 설명', '입력이 커질 때 메모리를 얼마나 더 쓰는지예요.'],
    [
      '의도한 시간(추정) 설명',
      '문제가 기대하는 빠르기를 AI가 어림한 값이에요. 문제에 적힌 값은 아니에요.',
    ],
  ])('복잡도 칸의 "%s" 버튼에 포커스하면 뜻을 알려 준다', async (name, text) => {
    stored(review())
    renderResult(ACCEPTED)

    const button = await screen.findByRole('button', { name })
    act(() => button.focus())

    expect(await screen.findByRole('tooltip')).toHaveTextContent(text)
  })

  it('터치로 "?"를 누르면 설명이 열리고, 바깥을 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    stored(review())
    renderResult(ACCEPTED)
    const button = await screen.findByRole('button', { name: '시간 설명' })

    // 마우스로 흉내 내면 hover만으로 열려, 누르기가 안 돼도 통과한다
    await user.pointer({ keys: '[TouchA]', target: button })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()

    await user.pointer({ keys: '[TouchA]', target: screen.getByText('비교 문장') })
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
  })

  it('열린 "?"를 다시 누르면 닫히고, 또 누르면 열린다', async () => {
    const user = userEvent.setup()
    stored(review())
    renderResult(ACCEPTED)
    const button = await screen.findByRole('button', { name: '시간 설명' })
    const tap = () => user.pointer({ keys: '[TouchA]', target: button })

    await tap()
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    await tap()
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    await tap()
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()

    // 키보드는 pointerdown 없이 click만 온다
    await user.keyboard('{Enter}')
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())
    await user.keyboard('{Enter}')
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

  // 스크린리더 같은 보조 기술은 pointerdown 없이 detail 1인 click만 보낼 수 있다
  it('pointerdown 없는 클릭도 누를 때마다 여닫는다', async () => {
    const user = userEvent.setup()
    stored(review())
    renderResult(ACCEPTED)
    const button = await screen.findByRole('button', { name: '시간 설명' })
    const gone = () => waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

    fireEvent.click(button, { detail: 1 })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    fireEvent.click(button, { detail: 1 })
    await gone()

    // 앞서 터치로 눌렀던 상태가 다음 클릭에 남지 않는다
    await user.pointer({ keys: '[TouchA]', target: button })
    await user.pointer({ keys: '[TouchA]', target: button })
    await gone()
    fireEvent.click(button, { detail: 1 })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

  it.each([
    [
      '누른 채 밖으로 끌어 놓기',
      (button: HTMLElement) => fireEvent.pointerLeave(button, { buttons: 1 }),
    ],
    ['컨텍스트 메뉴', (button: HTMLElement) => fireEvent.contextMenu(button)],
  ])('click 없이 끝난 누르기(%s)는 다음 클릭에 남지 않는다', async (_, abort) => {
    stored(review())
    renderResult(ACCEPTED)
    const button = await screen.findByRole('button', { name: '시간 설명' })
    fireEvent.click(button, { detail: 1 })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()

    // 누르는 순간 Radix가 닫고, click은 오지 않는다
    fireEvent.pointerDown(button, { buttons: 1 })
    abort(button)
    await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument())

    fireEvent.click(button, { detail: 1 })
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
  })

  it('click만으로 차례로 눌러도 마지막 설명 하나만 열려 있다', async () => {
    stored(review())
    renderResult(ACCEPTED)

    fireEvent.click(await screen.findByRole('button', { name: '시간 설명' }), { detail: 1 })
    fireEvent.click(screen.getByRole('button', { name: '공간 설명' }), { detail: 1 })

    await waitFor(() => expect(screen.getAllByRole('tooltip')).toHaveLength(1))
    expect(screen.getByRole('tooltip')).toHaveTextContent('메모리')
  })

  it('만들지 못했으면 이유를 알리고 다시 시도할 수 있다 (AI-06)', async () => {
    stored(review({ status: 'FAILED', failureReason: 'BUSY', ...EMPTY }))
    renderResult(ACCEPTED)

    expect(
      await screen.findByText('지금 리뷰를 기다리는 제출이 많아요. 잠시 후 다시 시도해 주세요.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeEnabled()
  })

  it('결과를 보여 줄 수 없는 리뷰면 안내만 하고 다시 요청하지 못한다 (AI-06)', async () => {
    stored(review({ blocked: true, ...EMPTY }))
    renderResult(ACCEPTED)

    expect(await screen.findByText(/이 제출은 AI 리뷰를 보여 줄 수 없어요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /AI 리뷰|다시 시도/ })).not.toBeInTheDocument()
    expect(screen.getByText('맞았습니다!!')).toBeInTheDocument()
  })

  it('한도 초과(429)를 받으면 분석과 같은 안내로 버튼을 끈다', async () => {
    const user = userEvent.setup()
    const exhausted = { ...QUOTA, used: 20, remaining: 0 }
    server.use(
      http.post('*/api/submissions/:id/code-review', () =>
        HttpResponse.json(
          { status: 429, code: 'AI_DAILY_LIMIT_EXCEEDED', detail: '다 썼어요', quota: exhausted },
          { status: 429 },
        ),
      ),
    )
    renderResult(ACCEPTED)

    await user.click(await screen.findByRole('button', { name: 'AI 리뷰' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/오늘 AI 분석·리뷰 20회를 다 썼어요/)
    expect(screen.getByRole('button', { name: 'AI 리뷰' })).toBeDisabled()
  })
})
