import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { LearningReport } from '@/api/types'
import { createQueryClient, POLL_INTERVAL_MS } from '@/app/queryClient'
import { FAILING_INTERVAL_MS } from '@/features/result/resultQuery'
import { learningReportOf, learningStatsReady, learningStatsShort } from '@/mocks/fixtures/learning'
import { resetLearningReport } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Component as ReportPage } from './ReportPage'

// 목의 '오늘 만든 리포트'는 모듈 상태다. 테스트끼리 넘어가지 않게 비운다
afterEach(() => resetLearningReport())

function renderReport() {
  const router = createMemoryRouter(
    [
      { path: '/me/report', Component: ReportPage },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
    ],
    { initialEntries: ['/me/report'] },
  )
  render(
    <QueryClientProvider client={createQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

/** 저장된 리포트를 정해 둔다. 만들기(POST)는 목 그대로다. */
function storedReport(report: LearningReport) {
  server.use(http.get('*/api/users/me/learning-report', () => HttpResponse.json(report)))
}

const NOW = new Date().toISOString()
const YESTERDAY = new Date(Date.now() - 86_400_000).toISOString()

describe('ReportPage — 리포트가 없을 때 (REP-01)', () => {
  it('맞힌 문제가 모자라면 더 맞혀야 할 개수와 문제 목록 길을 알려 준다', async () => {
    server.use(
      http.get('*/api/users/me/learning-stats', () => HttpResponse.json(learningStatsShort)),
    )
    renderReport()

    expect(await screen.findByText('3문제 더 맞히면 리포트를 볼 수 있어요')).toBeInTheDocument()
    expect(screen.getByText(/지금 2문제를 맞혔어요/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문제 보러 가기' })).toHaveAttribute(
      'href',
      '/problems',
    )
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '학습 리포트' })).toBeInTheDocument()
  })

  it('조건을 채웠으면 표 대신 첫 리포트를 권하고, 누르면 만들며 숫자를 먼저 보여 준 뒤 문장을 붙인다', async () => {
    const user = userEvent.setup()
    renderReport()

    const invite = await screen.findByRole('region', { name: '첫 학습 리포트를 만들어 볼까요?' })
    // 숫자의 출처는 리포트 저장본 하나다. 만들기 전에는 표를 그리지 않는다(#46)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(within(invite).getByRole('button', { name: '리포트 보기' }))

    // 만드는 중(PENDING)에도 수치는 저장본에 있다(계약)
    expect(await screen.findByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('AI가 분석 문장을 쓰고 있어요')
    // 다음 조회에 끝난다(목). 폴링이 이어받는다
    expect(
      await screen.findByText(/동적 계획법과 그래프를 조금 더 연습하면/, {}, { timeout: 3000 }),
    ).toBeInTheDocument()
  })

  it('남은 수가 계약 밖 음수여도 본문을 비우지 않고 권유를 그린다', async () => {
    server.use(
      http.get('*/api/users/me/learning-stats', () =>
        HttpResponse.json({ ...learningStatsReady, remainingProblemCount: -1 }),
      ),
    )
    renderReport()
    expect(
      await screen.findByRole('region', { name: '첫 학습 리포트를 만들어 볼까요?' }),
    ).toBeInTheDocument()
  })

  it('만들려는데 맞힌 문제가 모자라다(409)고 하면 통계를 다시 받아 남은 개수를 알려 준다', async () => {
    let stats = learningStatsReady
    server.use(
      http.get('*/api/users/me/learning-stats', () => HttpResponse.json(stats)),
      http.post('*/api/users/me/learning-report', () => {
        stats = learningStatsShort
        return HttpResponse.json(
          {
            status: 409,
            code: 'LEARNING_REPORT_NOT_AVAILABLE',
            detail: '맞힌 문제가 모자라요',
            remainingProblemCount: 3,
          },
          { status: 409 },
        )
      }),
    )
    const user = userEvent.setup()
    renderReport()

    await user.click(await screen.findByRole('button', { name: '리포트 보기' }))
    expect(await screen.findByText('3문제 더 맞히면 리포트를 볼 수 있어요')).toBeInTheDocument()
  })
})

describe('ReportPage — 저장된 리포트 (REP-02·03·05)', () => {
  it('표는 리포트 저장본의 값을 서버 순서 그대로 보여 주고, 해결률만 백분율로 적는다', async () => {
    storedReport(learningReportOf('COMPLETED', NOW))
    renderReport()

    await screen.findByRole('table')
    const rows = screen.getAllByRole('row').slice(1)
    // 서버가 정한 취약 점수 높은 순을 다시 정렬하지 않는다
    expect(rows.map((row) => within(row).getAllByRole('cell')[0].textContent)).toEqual([
      '동적 계획법취약',
      '그래프취약',
      '문자열',
      '수학',
    ])
    const dp = within(rows[0]).getAllByRole('cell')
    expect(dp[1]).toHaveTextContent('25%1 / 4')
    // 막대 이름은 수치가 아니라 무엇의 막대인지다(#271 리뷰)
    expect(within(dp[1]).getByRole('progressbar')).toHaveAccessibleName('동적 계획법 해결률')
    expect(dp[2]).toHaveTextContent('2.5')
    expect(dp[3]).toHaveTextContent('4.5')
    expect(dp[4]).toHaveTextContent('0.8')
    // 취약 여부는 서버의 weak만 따른다
    expect(within(rows[3]).queryByText('취약')).not.toBeInTheDocument()
  })

  it('가장 취약한 개념을 제목으로 권하고 그 개념의 문제 목록으로 보낸다', async () => {
    storedReport(learningReportOf('COMPLETED', NOW))
    renderReport()
    expect(
      await screen.findByRole('heading', {
        level: 1,
        // '조금 더' 뒤는 줄바꿈이다(#275). jsdom은 이름에서 줄바꿈을 공백으로 바꾸지 않는다
        name: /^동적 계획법 개념을 조금 더\s+연습해 볼까요\?$/,
      }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '동적 계획법 문제 풀기' })).toHaveAttribute(
      'href',
      '/problems?tag=dp',
    )
  })

  it('오늘 만든 리포트는 만든 시각과 하루 한 번 안내만 보이고 새로 만들기 버튼은 없다', async () => {
    storedReport(learningReportOf('COMPLETED', NOW))
    renderReport()

    expect(await screen.findByText(/에 만든 리포트예요 · 하루 한 번/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '리포트 보기' })).not.toBeInTheDocument()
  })

  it('지난 날짜의 리포트면 오늘 리포트를 새로 만들 수 있다고 알린다', async () => {
    storedReport(learningReportOf('COMPLETED', YESTERDAY))
    renderReport()

    expect(await screen.findByText('오늘 리포트를 새로 만들 수 있어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '리포트 보기' })).toBeEnabled()
  })

  it('AI 문장은 글자 그대로 보이고, 서버가 지운(null) 글은 빼고 보여 준다', async () => {
    storedReport(learningReportOf('COMPLETED', NOW))
    renderReport()

    const ai = await screen.findByRole('region', { name: 'AI 분석' })
    expect(within(ai).getByText(/7문제를 맞혔고/)).toBeInTheDocument()
    const cards = within(ai).getAllByRole('listitem')
    expect(cards.map((card) => within(card).getByRole('heading').textContent)).toEqual([
      '동적 계획법취약',
      '그래프취약',
    ])
    // 그래프의 설명은 수치가 맞지 않아 서버가 지웠다(fixture). 연습 방법만 남는다
    expect(within(cards[1]).queryByText('무엇이 어려웠나요')).not.toBeInTheDocument()
    expect(within(cards[1]).getByText('이렇게 연습해 보세요')).toBeInTheDocument()
  })

  it('문장이 모두 지워졌으면 보여 줄 문장이 없다고 한 줄 알린다', async () => {
    const report = learningReportOf('COMPLETED', NOW)
    storedReport({
      ...report,
      summary: null,
      weakConcepts: report.weakConcepts.map((c) => ({ ...c, explanation: null, practice: null })),
    })
    renderReport()

    expect(await screen.findByText(/보여 줄 수 있는 AI 분석 문장이 없어요/)).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('만들지 못했으면(FAILED) 이유와 다시 시도를 보이고, 누르면 다시 만든다', async () => {
    storedReport({ ...learningReportOf('FAILED', NOW), failureReason: 'BUSY' })
    let requested = 0
    server.use(
      http.post('*/api/users/me/learning-report', () => {
        requested += 1
        return HttpResponse.json(learningReportOf('PENDING', NOW), { status: 202 })
      }),
    )
    const user = userEvent.setup()
    renderReport()

    // BUSY는 리포트에 맞는 문구다('기다리는 제출'이 아니다)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'AI가 처리할 일이 많아 리포트를 만들지 못했어요',
    )
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(
      await screen.findByText('AI가 분석 문장을 쓰고 있어요. 숫자는 먼저 볼 수 있어요.'),
    ).toBeInTheDocument()
    expect(requested).toBe(1)
  })

  it('[다시 시도]를 누르는 동안 버튼이 사라지지 않고 기다림을 알린다', async () => {
    // 블록째 사라지면 키보드 포커스가 body로 떨어진다(#311 리뷰)
    storedReport(learningReportOf('FAILED', NOW))
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.post('*/api/users/me/learning-report', async () => {
        await held
        return HttpResponse.json(learningReportOf('PENDING', NOW), { status: 202 })
      }),
    )
    const user = userEvent.setup()
    renderReport()

    const retry = await screen.findByRole('button', { name: '다시 시도' })
    await user.click(retry)
    expect(retry).toBeInTheDocument()
    expect(retry).toHaveAttribute('aria-busy', 'true')

    release()
    expect(
      await screen.findByText('AI가 분석 문장을 쓰고 있어요. 숫자는 먼저 볼 수 있어요.'),
    ).toBeInTheDocument()
  })

  it('만드는 중 폴링 한 번이 일시적으로 실패해도 화면을 내리지 않고, 다음 조회에 끝난 것을 알린다', async () => {
    // 받아 둔 리포트가 있는데 503 한 번에 화면이 오류로 바뀌면 live region도 새로 생겨 '마쳤어요'를 못 읽는다(#311 리뷰)
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
    })
    try {
      let calls = 0
      server.use(
        http.get('*/api/users/me/learning-report', () => {
          calls += 1
          if (calls === 1) return HttpResponse.json(learningReportOf('PENDING', NOW))
          if (calls === 2) {
            return HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 })
          }
          return HttpResponse.json(learningReportOf('COMPLETED', NOW))
        }),
      )
      renderReport()

      const status = await screen.findByText(
        'AI가 분석 문장을 쓰고 있어요. 숫자는 먼저 볼 수 있어요.',
      )
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
      await waitFor(() => expect(calls).toBe(2))
      // 오류 화면으로 바뀌지 않는다. 같은 live region이 남아 있다
      expect(status).toBeInTheDocument()
      expect(screen.getByRole('table')).toBeInTheDocument()

      // 일시 실패 뒤에는 간격을 늘려 다시 묻는다
      await vi.advanceTimersByTimeAsync(FAILING_INTERVAL_MS)
      await waitFor(() => expect(status).toHaveTextContent('AI 분석을 마쳤어요.'))
      expect(screen.getByText(/7문제를 맞혔고/)).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('켜 둔 채 UTC 자정(한국 시각 오전 9시)을 넘기면 오늘 리포트를 새로 만들 수 있다고 알린다', async () => {
    // 끝난 리포트는 다시 받지 않아 날짜가 바뀐 것을 알 길이 없었다(#311 리뷰)
    vi.useFakeTimers({
      shouldAdvanceTime: true,
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    })
    try {
      vi.setSystemTime(new Date('2026-11-16T23:59:59.000Z'))
      storedReport(learningReportOf('COMPLETED', '2026-11-16T01:00:00.000Z'))
      renderReport()

      await screen.findByText(/에 만든 리포트예요/)
      expect(screen.queryByRole('button', { name: '리포트 보기' })).not.toBeInTheDocument()

      await vi.advanceTimersByTimeAsync(2_000)
      expect(await screen.findByText('오늘 리포트를 새로 만들 수 있어요')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '리포트 보기' })).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('내 학습 탭: 학습 리포트가 지금 화면이고 배지 화면으로 갈 수 있다 (BADGE-02)', async () => {
    renderReport()
    const nav = await screen.findByRole('navigation', { name: '내 학습 메뉴' })
    expect(within(nav).getByRole('link', { name: '학습 리포트' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: '배지' })).toHaveAttribute('href', '/me/badges')
  })

  it('불러오지 못하면 오류와 다시 시도를 보여 준다', async () => {
    server.use(
      http.get('*/api/users/me/learning-report', () =>
        HttpResponse.json({ status: 500, title: 'x' }, { status: 500 }),
      ),
    )
    renderReport()
    expect(await screen.findByRole('button', { name: /다시/ })).toBeInTheDocument()
  })
})
