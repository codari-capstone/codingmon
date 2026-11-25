import { focusManager, QueryClientProvider, QueryObserver } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { api } from '@/api/client'
import type { SubmissionAnalysis } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { Component as SubmissionResultPage } from '@/features/result/SubmissionResultPage'
import { setAccessToken } from '@/api/session'
import { resetSubscriptions, startMockSubscription } from '@/mocks/fixtures/subscriptions'
import { mockAccessToken } from '@/mocks/fixtures/users'
import { resetSubmissions } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { analysisQuery } from './analysisQuery'

const USER = { id: 1, nickname: '코다리', role: 'USER' } as const

/** 목 fixture의 지난 제출 23: 2번 문제의 틀렸습니다, Python (mocks/fixtures/history.ts). */
const WRONG = 23

function renderResult(client = createQueryClient()) {
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

/** 프로로 로그인한 요청으로 만든다. 무료(토큰 없음)는 1단계까지만 연다(PRICE-04, 목도 계약대로 403) */
function asPro() {
  setAccessToken(mockAccessToken(USER.id))
  startMockSubscription(USER.id, 'MONTHLY')
}

describe('HintSteps', () => {
  afterEach(() => {
    resetSubmissions()
    resetSubscriptions()
    setAccessToken(null)
    focusManager.setFocused(undefined)
  })

  it('다음 단계 하나만 열 수 있고, 열면 그다음 단계로 넘어간다 (AI-04)', async () => {
    const user = userEvent.setup()
    asPro()
    await analyzed()
    renderResult()

    expect(await step('1단계 관찰')).toBeEnabled()
    // 뒤 단계는 버튼 없이 단계 표시로만 보인다. 앞 단계를 건너뛰어 열 길이 없다
    expect(screen.queryByRole('button', { name: '2단계 방향 보기' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '3단계 원리 보기' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '1단계 관찰 보기' }))

    const hint = await screen.findByText(/첫 줄과 마지막 줄 별 개수/)
    // 새 힌트가 버튼 위에 열린다. 무엇이 열렸는지 바로 읽도록 포커스를 옮긴다.
    await waitFor(() => expect(hint).toHaveFocus())
    expect(screen.getByRole('button', { name: '2단계 방향 보기' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '3단계 원리 보기' })).not.toBeInTheDocument()
    // 단계 표시 아래는 순서가 바로 보이게 번호로, 힌트 상자는 그 단계의 뜻까지 적는다(#327)
    const [stepper] = within(screen.getByRole('region', { name: '단계별 힌트' })).getAllByRole(
      'list',
    )
    expect(
      within(stepper!)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['1단계', '22단계', '33단계'])
    expect(screen.getByText('힌트 1 · 관찰')).toBeInTheDocument()
  })

  it('세 단계를 다 열면 마지막 안내를 띄운다', async () => {
    const user = userEvent.setup()
    asPro()
    await analyzed()
    renderResult()

    await user.click(await step('1단계 관찰'))
    await user.click(await step('2단계 방향'))
    await user.click(await step('3단계 원리'))

    expect(await screen.findByText(/3단계가 마지막 힌트예요/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /단계 .* 보기/ })).not.toBeInTheDocument()
  })

  it('저장된 단계까지 열린 채로 다시 열린다', async () => {
    asPro()
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

  describe('요금제 잠금 (AI-04, PRICE-04)', () => {
    const lock = () => screen.findByText('다음 단계 힌트는 프로에서 열 수 있어요')

    it('무료는 1단계를 열면 다음 단계 버튼 자리에 프로 안내를 보인다', async () => {
      const user = userEvent.setup()
      await analyzed()
      renderResult()

      await user.click(await step('1단계 관찰'))

      expect(await lock()).toBeInTheDocument()
      expect(screen.getByRole('link', { name: '프로 시작하기' })).toHaveAttribute(
        'href',
        '/pricing',
      )
      expect(screen.queryByRole('button', { name: '2단계 방향 보기' })).not.toBeInTheDocument()
    })

    it('프로일 때 연 힌트는 무료가 된 뒤에도 보이고, 다음 단계 자리에 같은 안내를 보인다', async () => {
      server.use(
        http.get('*/api/submissions/:id/analysis', () => HttpResponse.json(analysisAt(2, 1))),
      )
      renderResult()

      expect(await lock()).toBeInTheDocument()
      expect(screen.getByText('힌트 1')).toBeInTheDocument()
      expect(screen.getByText('힌트 2')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '3단계 원리 보기' })).not.toBeInTheDocument()
    })

    it('세 단계를 다 열었으면 안내를 보이지 않는다', async () => {
      server.use(
        http.get('*/api/submissions/:id/analysis', () => HttpResponse.json(analysisAt(3, 1))),
      )
      renderResult()

      expect(await screen.findByText(/3단계가 마지막 힌트예요/)).toBeInTheDocument()
      expect(screen.queryByText('다음 단계 힌트는 프로에서 열 수 있어요')).not.toBeInTheDocument()
    })

    it('프로가 끝난 뒤 낡은 화면에서 누르면(403) 분석을 다시 받아 안내로 바꾼다', async () => {
      const user = userEvent.setup()
      let gets = 0
      server.use(
        http.get('*/api/submissions/:id/analysis', () => {
          gets++
          return HttpResponse.json(analysisAt(1, gets === 1 ? 3 : 1))
        }),
        http.post('*/api/submissions/:id/analysis/hints', () =>
          HttpResponse.json(
            { status: 403, code: 'HINT_PLAN_REQUIRED', detail: '프로에서 열 수 있어요' },
            { status: 403 },
          ),
        ),
      )
      renderResult()

      await user.click(await step('2단계 방향'))

      expect(await lock()).toBeInTheDocument()
      expect(gets).toBe(2)
      // 안내가 403의 뜻을 대신하므로 오류 문구를 겹쳐 띄우지 않는다
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
      // 누른 버튼이 사라졌으니 포커스를 안내로 옮긴다(#377 리뷰)
      await waitFor(() =>
        expect(screen.getByText('다음 단계 힌트는 프로에서 열 수 있어요')).toHaveFocus(),
      )
    })

    it('403 뒤 분석을 다시 받지 못해도 잠금을 유지한다 (#377 리뷰)', async () => {
      // 다시 받기만 기다리면 실패했을 때 캐시의 maxHintLevel 3이 남아 버튼이 살아나고 403을 되풀이한다
      const user = userEvent.setup()
      let gets = 0
      server.use(
        http.get('*/api/submissions/:id/analysis', () => {
          gets++
          return gets === 1
            ? HttpResponse.json(analysisAt(1, 3))
            : new HttpResponse(null, { status: 500 })
        }),
        http.post('*/api/submissions/:id/analysis/hints', () =>
          HttpResponse.json(
            { status: 403, code: 'HINT_PLAN_REQUIRED', detail: '프로에서 열 수 있어요' },
            { status: 403 },
          ),
        ),
      )
      const client = renderResult()

      await user.click(await step('2단계 방향'))

      expect(await lock()).toBeInTheDocument()
      // 핸들러가 불린 것만으로는 부족하다. 500을 받아 쿼리가 오류로 끝난 뒤에 본다(#377 리뷰)
      await waitFor(() => expect(client.getQueryState(['analysis', WRONG])?.status).toBe('error'))
      expect(gets).toBe(2)
      expect(screen.getByText('다음 단계 힌트는 프로에서 열 수 있어요')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '2단계 방향 보기' })).not.toBeInTheDocument()
      expect(screen.getByText('힌트 1')).toBeInTheDocument()
    })

    it('잠기지 않은 분석은 낡았으면 화면에 들어올 때 다시 받는다 (기본 동작, #377 리뷰)', async () => {
      // 잠금 때문에 넣은 refetchOnMount가 잠기지 않은 분석에서 기본값(낡았으면 다시 받기)을 끄면 안 된다.
      // 결과 화면을 그리면 안 된다 — 결과 화면의 같은 쿼리는 enabled가 나중에 켜지며 refetchOnMount와 상관없이
      // 받는다. 처음부터 켜진 채 붙는 분석 패널과 같게 observer를 바로 붙인다
      let gets = 0
      server.use(
        http.get('*/api/submissions/:id/analysis', () => {
          gets++
          return HttpResponse.json(analysisAt(2, 3))
        }),
      )
      const client = createQueryClient()
      client.setQueryData(['analysis', WRONG], analysisAt(1, 3), { updatedAt: Date.now() - 60_000 })

      const unsubscribe = new QueryObserver(client, analysisQuery(WRONG)).subscribe(() => {})

      await waitFor(() => expect(gets).toBe(1))
      unsubscribe()
    })

    it('힌트 응답보다 뒤에 나간 분석 조회는 버리지 않고 다시 받는다 (#377 리뷰)', async () => {
      // 무료로 힌트를 여는 중에 결제가 끝나 분석이 무효화됐다. 늦게 온 힌트 응답(무료)이 새 조회를 끊고 남으면 잠긴다
      const user = userEvent.setup()
      let releasePost!: () => void
      const heldPost = new Promise<void>((resolve) => (releasePost = resolve))
      let gets = 0
      server.use(
        http.get('*/api/submissions/:id/analysis', async () => {
          gets++
          if (gets === 1) return HttpResponse.json(analysisAt(0, 1))
          if (gets === 2) await new Promise(() => {}) // 결제 뒤 나간 조회. 힌트 응답이 끊는다
          return HttpResponse.json(analysisAt(1, 3))
        }),
        http.post('*/api/submissions/:id/analysis/hints', async () => {
          await heldPost
          return HttpResponse.json(analysisAt(1, 1))
        }),
      )
      const client = renderResult()
      await user.click(await step('1단계 관찰'))

      void client.invalidateQueries({ queryKey: ['analysis'] })
      await waitFor(() => expect(gets).toBe(2))
      releasePost()

      expect(await step('2단계 방향')).toBeEnabled()
      expect(gets).toBe(3)
    })

    it('잠긴 결과에 30초 안에 다시 들어와도 분석을 다시 받는다 (#377 리뷰)', async () => {
      // 다른 화면에 있는 동안 다른 탭에서 결제했다. 캐시는 아직 fresh라 그냥 두면 GET을 보내지 않는다
      const client = createQueryClient()
      client.setQueryData(['analysis', WRONG], analysisAt(1, 1))
      server.use(
        http.get('*/api/submissions/:id/analysis', () => HttpResponse.json(analysisAt(1, 3))),
      )
      renderResult(client)

      expect(await step('2단계 방향')).toBeEnabled()
    })

    it('403 뒤 다른 탭에서 결제해 잠금이 풀리면 지난 403 문구를 띄우지 않는다 (#377 리뷰)', async () => {
      const user = userEvent.setup()
      let maxHintLevel: SubmissionAnalysis['maxHintLevel'] = 3
      server.use(
        http.get('*/api/submissions/:id/analysis', () =>
          HttpResponse.json(analysisAt(1, maxHintLevel)),
        ),
        http.post('*/api/submissions/:id/analysis/hints', () =>
          HttpResponse.json(
            { status: 403, code: 'HINT_PLAN_REQUIRED', detail: '프로에서 열 수 있어요' },
            { status: 403 },
          ),
        ),
      )
      renderResult()
      // 낡은 화면(3)에서 누른다. 서버는 이미 무료라 다시 받으면 1이다
      await step('2단계 방향')
      maxHintLevel = 1
      await user.click(screen.getByRole('button', { name: '2단계 방향 보기' }))
      await lock()

      maxHintLevel = 3
      act(() => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
      })

      expect(await step('2단계 방향')).toBeEnabled()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('잠긴 채로 다른 탭에서 결제하고 돌아오면 분석을 다시 받아 다음 단계를 연다 (#377 리뷰)', async () => {
      let maxHintLevel: SubmissionAnalysis['maxHintLevel'] = 1
      server.use(
        http.get('*/api/submissions/:id/analysis', () =>
          HttpResponse.json(analysisAt(1, maxHintLevel)),
        ),
      )
      renderResult()
      await lock()

      maxHintLevel = 3
      act(() => {
        focusManager.setFocused(false)
        focusManager.setFocused(true)
      })

      expect(await step('2단계 방향')).toBeEnabled()
      expect(screen.queryByText('다음 단계 힌트는 프로에서 열 수 있어요')).not.toBeInTheDocument()
    })
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

function analysisAt(
  level: number,
  maxHintLevel: SubmissionAnalysis['maxHintLevel'] = 3,
): SubmissionAnalysis {
  return {
    submissionId: WRONG,
    status: 'COMPLETED',
    failureReason: null,
    maxHintLevel,
    blocked: false,
    summary: '요약',
    suspectLines: [],
    facts: [],
    guesses: [],
    revealedHintLevel: level,
    hints: ['힌트 1', '힌트 2', '힌트 3'].slice(0, level),
    createdAt: '2026-11-07T00:00:00Z',
    completedAt: '2026-11-07T00:00:05Z',
    quota: { plan: 'FREE', limit: 20, used: 1, remaining: 19, resetsAt: '2026-11-08T00:00:00Z' },
  }
}
