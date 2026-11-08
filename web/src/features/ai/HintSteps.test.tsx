import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { api } from '@/api/client'
import type { SubmissionAnalysis } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { Component as SubmissionResultPage } from '@/features/result/SubmissionResultPage'
import { resetSubmissions } from '@/mocks/handlers'
import { server } from '@/mocks/server'

const USER = { id: 1, nickname: '코다리', role: 'USER' } as const

/** 목 fixture의 지난 제출 23: 2번 문제의 틀렸습니다, Python (mocks/fixtures/history.ts). */
const WRONG = 23

function renderResult() {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, USER)
  const router = createMemoryRouter(
    [{ path: '/submissions/:id', Component: SubmissionResultPage }],
    {
      initialEntries: [`/submissions/${WRONG}`],
    },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return client
}

/** 목에 분석을 만들어 둔다. 다음 조회부터 끝난 분석이다 (handlers.ts). */
async function analyzed() {
  await api.POST('/api/submissions/{id}/analysis', { params: { path: { id: WRONG } } })
}

const step = (name: string) => screen.findByRole('button', { name: `${name} 보기` })

describe('HintSteps', () => {
  afterEach(() => resetSubmissions())

  it('1단계만 켜져 있고 앞 단계를 열어야 다음 단계가 켜진다 (AI-04)', async () => {
    const user = userEvent.setup()
    await analyzed()
    renderResult()

    expect(await step('1단계 관찰')).toBeEnabled()
    expect(screen.getByRole('button', { name: '2단계 방향 보기' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '3단계 원리 보기' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: '1단계 관찰 보기' }))

    const hint = await screen.findByText(/첫 줄과 마지막 줄 별 개수/)
    // 누른 버튼이 사라지므로 포커스를 방금 연 힌트로 옮긴다.
    await waitFor(() => expect(hint).toHaveFocus())
    expect(screen.getByRole('button', { name: '2단계 방향 보기' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '3단계 원리 보기' })).toBeDisabled()
  })

  it('세 단계를 다 열면 마지막 안내를 띄운다', async () => {
    const user = userEvent.setup()
    await analyzed()
    renderResult()

    await user.click(await step('1단계 관찰'))
    await user.click(await step('2단계 방향'))
    await user.click(await step('3단계 원리'))

    expect(await screen.findByText(/3단계가 마지막 힌트예요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /단계 .* 보기/ })).not.toBeInTheDocument()
  })

  it('저장된 단계까지 열린 채로 다시 열린다', async () => {
    await analyzed()
    await api.POST('/api/submissions/{id}/analysis/hints', {
      params: { path: { id: WRONG } },
      body: { level: 1 },
    })
    await api.POST('/api/submissions/{id}/analysis/hints', {
      params: { path: { id: WRONG } },
      body: { level: 2 },
    })
    renderResult()

    expect(await step('3단계 원리')).toBeEnabled()
    expect(screen.getByText(/첫 줄과 마지막 줄 별 개수/)).toBeInTheDocument()
    expect(screen.getByText(/줄 번호 i가 커질 때/)).toBeInTheDocument()
  })

  it('여는 중에는 다시 누를 수 없다', async () => {
    const user = userEvent.setup()
    await analyzed()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let requests = 0
    server.use(
      http.post('*/api/submissions/:id/analysis/hints', async () => {
        requests++
        await held
        return new HttpResponse(null, { status: 500 })
      }),
    )
    renderResult()

    await user.click(await step('1단계 관찰'))

    expect(screen.getByRole('button', { name: '1단계 관찰 보기' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '1단계 관찰 보기' }))
    expect(requests).toBe(1)
    release()
  })

  /** 연 힌트는 학습 통계와 제출 기록의 숫자에 들어간다(계약). */
  it('열면 학습 통계와 제출 기록 캐시를 무효화한다', async () => {
    const user = userEvent.setup()
    await analyzed()
    const client = renderResult()
    client.setQueryData(['learning-stats'], { stale: true })
    client.setQueryData(['problem-history', { page: 0 }], { stale: true })

    await user.click(await step('1단계 관찰'))
    await screen.findByText(/첫 줄과 마지막 줄 별 개수/)

    expect(client.getQueryState(['learning-stats'])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['problem-history', { page: 0 }])?.isInvalidated).toBe(true)
  })

  it('409면 서버 문구를 보이고 분석을 다시 받아 지금 단계로 맞춘다', async () => {
    const user = userEvent.setup()
    await analyzed()
    let gets = 0
    server.use(
      http.get('*/api/submissions/:id/analysis', () => {
        gets++
        return HttpResponse.json(analysisAt(gets === 1 ? 0 : 1))
      }),
      http.post('*/api/submissions/:id/analysis/hints', () =>
        HttpResponse.json(
          { status: 409, code: 'HINT_LEVEL_SKIPPED', detail: '앞 단계 힌트를 먼저 열어 주세요' },
          { status: 409 },
        ),
      ),
    )
    renderResult()

    await user.click(await step('1단계 관찰'))

    expect(await screen.findByRole('alert')).toHaveTextContent('앞 단계 힌트를 먼저 열어 주세요')
    // 다시 받은 분석(1단계까지 열림)이 화면에 든다.
    expect(await screen.findByText('힌트 1')).toBeInTheDocument()
    expect(gets).toBe(2)
  })

  it('코드 고치러 가기는 다시 풀기와 같은 주소다', async () => {
    await analyzed()
    renderResult()

    expect(await screen.findByRole('link', { name: '코드 고치러 가기' })).toHaveAttribute(
      'href',
      screen.getByRole('link', { name: '다시 풀기' }).getAttribute('href'),
    )
  })
})

function analysisAt(level: number): SubmissionAnalysis {
  return {
    submissionId: WRONG,
    status: 'COMPLETED',
    blocked: false,
    summary: '요약',
    suspectLines: [],
    facts: [],
    guesses: [],
    revealedHintLevel: level,
    hints: ['힌트 1', '힌트 2', '힌트 3'].slice(0, level),
    createdAt: '2026-11-07T00:00:00Z',
    completedAt: '2026-11-07T00:00:05Z',
    quota: { limit: 20, used: 1, remaining: 19, resetsAt: '2026-11-08T00:00:00Z' },
  }
}
