import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import type { SubmissionAnalysis } from '@/api/types'
import { createQueryClient, POLL_INTERVAL_MS } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { Component as SubmissionResultPage } from '@/features/result/SubmissionResultPage'
import { resetSubmissions } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { FAILING_INTERVAL_MS, submissionResultQuery } from '@/features/result/resultQuery'
import { analysisPollingInterval } from './analysisQuery'
import { countLines } from './countLines'

const USER = { id: 1, nickname: '코다리', role: 'USER' } as const

/**
 * 목 fixture의 지난 제출 (mocks/fixtures/history.ts). 23은 2번 문제의 틀렸습니다(Python 4줄),
 * 11은 1번 문제의 맞았습니다다.
 */
const WRONG = 23
const ACCEPTED = 11

function renderResult(id: number) {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, USER)
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
  return { client, router }
}

function analysis(over: Partial<SubmissionAnalysis> = {}): SubmissionAnalysis {
  return {
    submissionId: WRONG,
    status: 'COMPLETED',
    failureReason: null,
    blocked: false,
    summary: '요약 문장',
    suspectLines: [2],
    facts: ['확인된 사실'],
    guesses: ['짐작한 원인'],
    revealedHintLevel: 0,
    hints: [],
    createdAt: '2026-11-07T00:00:00Z',
    completedAt: '2026-11-07T00:00:05Z',
    quota: { limit: 20, used: 1, remaining: 19, resetsAt: '2026-11-08T00:00:00Z' },
    ...over,
  }
}

/** 저장된 분석을 정해 둔다. 요청(POST)은 목 그대로다. */
function stored(value: SubmissionAnalysis) {
  server.use(http.get('*/api/submissions/:id/analysis', () => HttpResponse.json(value)))
}

describe('AnalysisPanel', () => {
  afterEach(() => resetSubmissions())

  it('countLines는 끝의 줄바꿈 하나를 줄로 세지 않는다', () => {
    expect(countLines('a\nb\n')).toBe(2)
    expect(countLines('a\r\nb\r\n')).toBe(2)
    expect(countLines('a\nb')).toBe(2)
    expect(countLines('')).toBe(1)
  })

  describe('AI 분석 요청 (AI-01·02)', () => {
    it('정답이면 AI 분석 패널이 없다', async () => {
      renderResult(ACCEPTED)
      await screen.findByText('맞았습니다!!')

      expect(screen.queryByRole('heading', { name: 'AI 분석' })).not.toBeInTheDocument()
    })

    it('누르면 만드는 동안 안내하고, 끝나면 원인 설명을 보여 준다', async () => {
      const user = userEvent.setup()
      renderResult(WRONG)

      await user.click(await screen.findByRole('button', { name: 'AI 분석' }))

      // 목은 요청에 PENDING을 주고 다음 조회에 끝낸다 (handlers.ts).
      expect(await screen.findByText('AI가 분석하고 있어요…')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'AI 분석' })).not.toBeInTheDocument()
      expect(
        await screen.findByText('별 개수가 줄마다 줄어야 하는데 늘어나고 있어요.', undefined, {
          timeout: 3000,
        }),
      ).toBeInTheDocument()
      // 끝난 분석은 다시 만들지 않는다(계약). 누를 것이 없다.
      expect(screen.queryByRole('button', { name: /AI 분석|다시 시도/ })).not.toBeInTheDocument()
    })

    it('다시 들어오면 저장된 분석을 바로 보여 준다', async () => {
      stored(analysis())
      renderResult(WRONG)

      expect(await screen.findByText('요약 문장')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'AI 분석' })).not.toBeInTheDocument()
    })

    it('만들지 못했으면 다시 시도할 수 있다', async () => {
      const user = userEvent.setup()
      stored(
        analysis({
          status: 'FAILED',
          failureReason: 'UNAVAILABLE',
          summary: null,
          suspectLines: [],
          facts: [],
          guesses: [],
        }),
      )
      let requests = 0
      server.use(
        http.post('*/api/submissions/:id/analysis', () => {
          requests++
          return HttpResponse.json(analysis())
        }),
      )
      renderResult(WRONG)

      expect(
        await screen.findByText('분석을 만들지 못했어요. 다시 시도해 주세요.'),
      ).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '다시 시도' }))

      expect(await screen.findByText('요약 문장')).toBeInTheDocument()
      expect(requests).toBe(1)
    })

    it('요청이 거절되면 서버 문구를 보이고 채점 결과는 그대로 둔다 (AI-06)', async () => {
      const user = userEvent.setup()
      server.use(
        http.post('*/api/submissions/:id/analysis', () =>
          HttpResponse.json(
            {
              status: 409,
              code: 'ANALYSIS_NOT_AVAILABLE',
              detail: '오답 판정을 받은 제출만 분석할 수 있어요',
            },
            { status: 409 },
          ),
        ),
      )
      renderResult(WRONG)

      await user.click(await screen.findByRole('button', { name: 'AI 분석' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        '오답 판정을 받은 제출만 분석할 수 있어요',
      )
      expect(screen.getByText('틀렸습니다')).toBeInTheDocument()
    })
  })

  describe('원인 설명 (AI-03)', () => {
    it('항목을 [실행 결과]/[코드 분석] 배지로 나누고 의심되는 줄을 보여 준다', async () => {
      stored(analysis({ facts: ['사실 하나'], guesses: ['짐작 하나'] }))
      renderResult(WRONG)

      const fact = (await screen.findByText('사실 하나')).closest('li')
      const guess = screen.getByText('짐작 하나').closest('li')
      expect(fact).toHaveTextContent('실행 결과')
      expect(guess).toHaveTextContent('코드 분석')
      expect(screen.getByText(/의심되는 줄/)).toHaveTextContent(/^의심되는 줄 · 2번$/)
    })

    /** 계약: 서버가 범위를 검사하기(#79) 전에 저장된 분석이 남아 있다. 제출 코드는 4줄이다. */
    it('제출 코드의 줄 수를 넘는 줄 번호는 버린다', async () => {
      stored(analysis({ suspectLines: [4, 5, 99] }))
      renderResult(WRONG)

      expect(await screen.findByText(/의심되는 줄/)).toHaveTextContent(/^의심되는 줄 · 4번$/)
    })

    it('0·음수·정수가 아닌 줄 번호는 버리고 겹치면 하나로 줄인다', async () => {
      stored(analysis({ suspectLines: [0, -1, 2, 2, 1.5, 3] }))
      renderResult(WRONG)

      expect(await screen.findByText(/의심되는 줄/)).toHaveTextContent(/^의심되는 줄 · 2번, 3번$/)
    })

    it('제출한 코드에서 의심되는 줄을 칠한다. 범위 밖 번호는 칠하지 않는다', async () => {
      // 패널 문구와 같은 목록(suspectLines)을 쓴다. 없는 줄을 칠하면 학생이 그 줄을 찾아 헤맨다
      stored(analysis({ suspectLines: [2, 99] }))
      renderResult(WRONG)

      expect(await screen.findByText('빨간 줄은 AI가 의심한 줄이에요.')).toBeInTheDocument()
      const marked = document.querySelectorAll('[data-highlighted]')
      expect(marked).toHaveLength(1)
      expect([...marked[0].parentElement!.children].indexOf(marked[0])).toBe(1)
    })

    it('남은 줄 번호가 없으면 줄 안내를 그리지 않는다', async () => {
      stored(analysis({ suspectLines: [99] }))
      renderResult(WRONG)

      await screen.findByText('요약 문장')
      expect(screen.queryByText(/의심되는 줄/)).not.toBeInTheDocument()
    })

    /** 모델이 만든 문장이라 HTML로 해석하지 않는다(계약). */
    it('문장을 글자 그대로 보여 준다', async () => {
      stored(analysis({ summary: '<b>굵게</b> & 끝' }))
      renderResult(WRONG)

      expect(await screen.findByText('<b>굵게</b> & 끝')).toBeInTheDocument()
    })
  })

  describe('AI 사용 불가 (AI-06)', () => {
    it('결과를 보여 줄 수 없는 분석이면 안내만 하고 다시 요청하지 못한다', async () => {
      stored(analysis({ blocked: true, summary: null, suspectLines: [], facts: [], guesses: [] }))
      renderResult(WRONG)

      expect(await screen.findByText(/이 제출은 AI 분석을 보여 줄 수 없어요/)).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /AI 분석|다시 시도/ })).not.toBeInTheDocument()
      expect(screen.getByText('틀렸습니다')).toBeInTheDocument()
    })

    it('저장된 분석을 불러오지 못하면 패널 안에서만 오류와 다시 시도를 보여 준다', async () => {
      server.use(
        http.get('*/api/submissions/:id/analysis', () => HttpResponse.json({}, { status: 500 })),
      )
      renderResult(WRONG)

      expect(
        await screen.findByRole('button', { name: '다시 시도' }, { timeout: 3000 }),
      ).toBeInTheDocument()
      expect(screen.getByText('틀렸습니다')).toBeInTheDocument()
    })

    /** 폴링이 멈추는 때와 오류를 띄우는 때가 같다(isDeadEnd). 어긋나면 '분석 중'에 갇힌다. */
    it('만드는 중에 다시 물어도 소용없는 오류가 오면 분석 중에 머물지 않고 오류를 보여 준다', async () => {
      let gets = 0
      server.use(
        http.get('*/api/submissions/:id/analysis', () =>
          ++gets === 1
            ? HttpResponse.json(
                analysis({
                  status: 'PENDING',
                  summary: null,
                  suspectLines: [],
                  facts: [],
                  guesses: [],
                  createdAt: new Date().toISOString(),
                  completedAt: null,
                }),
              )
            : HttpResponse.json({ status: 403 }, { status: 403 }),
        ),
      )
      renderResult(WRONG)

      expect(await screen.findByText('AI가 분석하고 있어요…')).toBeInTheDocument()
      expect(
        await screen.findByRole('heading', { name: '권한이 없습니다' }, { timeout: 3000 }),
      ).toBeInTheDocument()
      expect(screen.queryByText('AI가 분석하고 있어요…')).not.toBeInTheDocument()
      expect(screen.getByText('틀렸습니다')).toBeInTheDocument()
    })

    it('세션이 끊겼으면 들고 있던 세션을 버린다', async () => {
      server.use(
        http.get('*/api/submissions/:id/analysis', () =>
          HttpResponse.json({ status: 401 }, { status: 401 }),
        ),
      )
      const { client } = renderResult(WRONG)

      await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull())
    })
  })

  /**
   * 리뷰 지적: 같은 패널을 이어 쓰면 진행 중인 요청이 마지막 렌더의 onSuccess로 끝나, A의
   * 분석이 B의 캐시에 들어갔다. 22는 2번 문제의 런타임 에러(오답)다.
   */
  it('요청 중에 다른 제출로 가도 응답은 요청한 제출의 캐시에 든다', async () => {
    const user = userEvent.setup()
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('*/api/submissions/:id/analysis', async () => {
        await held
        return HttpResponse.json(analysis({ submissionId: WRONG }))
      }),
    )
    const { client, router } = renderResult(WRONG)
    // B의 결과가 캐시에 있어야 로딩 화면 없이 같은 패널이 이어 쓰인다. 없으면 결과를 받는
    // 동안 패널이 사라졌다 다시 생겨 이 경우를 지나친다.
    await client.prefetchQuery(submissionResultQuery(22))

    await user.click(await screen.findByRole('button', { name: 'AI 분석' }))
    await router.navigate('/submissions/22')
    await screen.findByText('제출 #22')
    release()

    await waitFor(() =>
      expect(client.getQueryData(['analysis', WRONG])).toMatchObject({ submissionId: WRONG }),
    )
    expect(client.getQueryData(['analysis', 22])).toBeNull()
  })
})

describe('analysisPollingInterval', () => {
  const createdAt = '2026-11-07T00:00:00Z'
  const at = (seconds: number) => Date.parse(createdAt) + seconds * 1000
  const pending = analysis({ status: 'PENDING', createdAt })

  it('만드는 중일 때만 묻고, 오래 걸릴수록 뜸하게 묻는다', () => {
    expect(analysisPollingInterval(null, pending, at(5))).toBe(POLL_INTERVAL_MS)
    expect(analysisPollingInterval(null, pending, at(30))).toBe(POLL_INTERVAL_MS * 3)
    expect(analysisPollingInterval(null, pending, at(300))).toBe(POLL_INTERVAL_MS * 10)
    expect(analysisPollingInterval(null, analysis(), at(5))).toBe(false)
    expect(analysisPollingInterval(null, null, at(5))).toBe(false)
  })

  it('실패가 이어지면 늦추고, 다시 물어도 소용없으면 멈춘다', () => {
    expect(analysisPollingInterval({ status: 500 }, pending, at(5))).toBe(FAILING_INTERVAL_MS)
    expect(analysisPollingInterval({ status: 403 }, pending, at(5))).toBe(false)
  })
})
