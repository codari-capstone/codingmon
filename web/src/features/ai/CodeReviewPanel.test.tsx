import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
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

const QUOTA = { limit: 20, used: 1, remaining: 19, resetsAt: '2026-11-08T00:00:00Z' }

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
    expect(
      await screen.findByText(/필요한 일만 하는 깔끔한 풀이예요/, undefined, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(screen.getAllByText('O(1)')).toHaveLength(3)
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
