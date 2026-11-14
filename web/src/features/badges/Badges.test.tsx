import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, Link, Outlet, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import type { BadgeCode } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { submitCode, SUBMIT_MUTATION_KEY } from '@/features/solve/submitQuery'
import { badgesFor } from '@/mocks/fixtures/badges'
import { resetSubmissions } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { BadgeCelebrator } from './BadgeCelebrator'
import { Component as MyBadgesPage } from './MyBadgesPage'

const USER = { id: 1, nickname: '코다리', role: 'USER' } as const

afterEach(() => resetSubmissions())

/**
 * 1번 회원의 배지에 `waiting`(받았는데 축하 전)을 더해 답한다. 목 핸들러는 토큰으로 회원을 가리는데
 * 테스트는 토큰이 없어 직접 답한다. 축하 기록(POST)은 이 테스트 안에서만 센다.
 */
function serveBadges(waiting: BadgeCode[] = []) {
  const celebrated: BadgeCode[] = []
  server.use(
    http.get('*/api/users/me/badges', () =>
      HttpResponse.json({
        badges: badgesFor(1).map((badge) =>
          waiting.includes(badge.code) && !celebrated.includes(badge.code)
            ? {
                ...badge,
                unlockedAt: badge.unlockedAt ?? '2026-11-15T01:00:00Z',
                celebrated: false,
              }
            : badge,
        ),
      }),
    ),
    http.post('*/api/users/me/badges/:code/celebrated', ({ params }) => {
      celebrated.push(params.code as BadgeCode)
      return new HttpResponse(null, { status: 204 })
    }),
  )
  return celebrated
}

function renderAt(url: string, client: QueryClient = createQueryClient()) {
  client.setQueryData(ME_QUERY_KEY, USER)
  const router = createMemoryRouter(
    [
      {
        // RootLayout처럼 화면 옆에 축하 창을 둔다
        path: '/',
        element: (
          <>
            <Outlet />
            <BadgeCelebrator />
          </>
        ),
        children: [
          { path: 'me/badges', Component: MyBadgesPage },
          { path: 'me/report', element: <h1>리포트 도착</h1> },
          {
            path: 'submissions/:id',
            element: (
              <>
                <h1>결과 화면</h1>
                <Link to="/problems">문제 목록으로</Link>
              </>
            ),
          },
          { path: 'problems', element: <h1>문제 목록</h1> },
        ],
      },
    ],
    { initialEntries: [url] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { client, router }
}

/** useSubmit과 같은 키로 제출 mutation을 남긴다. 목은 조회마다 채점이 한 걸음 나아간다. */
async function submitLikeSolvePage(client: QueryClient) {
  return client
    .getMutationCache()
    .build(client, { mutationKey: SUBMIT_MUTATION_KEY, mutationFn: submitCode })
    .execute({ problemId: 1, language: 'PYTHON', sourceCode: 'print(1)' })
}

describe('MyBadgesPage (BADGE-01·02)', () => {
  it('묶음 셋에 서버 순서대로 4개씩, 받은 배지는 한국 날짜로 보여 준다', async () => {
    serveBadges()
    renderAt('/me/badges')

    expect(
      await screen.findByRole('heading', { level: 1, name: '배지 2개를 모았어요' }),
    ).toBeInTheDocument()

    const groups = ['꾸준함', '실력', '도전'].map((name) => screen.getByRole('region', { name }))
    const names = groups.map((group) =>
      within(group)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    )
    expect(names).toEqual([
      ['첫 정답', '3일 연속', '7일 연속', '14일 연속'],
      ['보통', '어려움', '한 번에 맞힘', '힌트 없이'],
      ['다시 도전', '끈기', '중급자', '마스터'],
    ])
    expect(groups[0]).toHaveTextContent('2 / 4')
    expect(groups[1]).toHaveTextContent('0 / 4')

    const cards = within(groups[0]).getAllByRole('listitem')
    expect(cards[0]).toHaveTextContent('2026.10.02 획득')
    // 2026-11-12T15:30Z는 한국 시각 11월 13일 00:30이다
    expect(cards[1]).toHaveTextContent('2026.11.13 획득')
    // 못 받은 배지는 조건만 적는다(진행도 없음)
    expect(cards[2]).toHaveTextContent(/^7일 연속7일 연속으로 제출하기아직 못 받았어요$/)
  })

  it('머리 개수는 묶음과 같은 12개 코드로 센다 (서버가 먼저 낸 배지는 세지 않음)', async () => {
    server.use(
      http.get('*/api/users/me/badges', () =>
        HttpResponse.json({
          badges: [
            ...badgesFor(1),
            { code: 'NEW_FROM_SERVER', unlockedAt: '2026-11-15T01:00:00Z', celebrated: true },
          ],
        }),
      ),
    )
    renderAt('/me/badges')
    expect(
      await screen.findByRole('heading', { level: 1, name: '배지 2개를 모았어요' }),
    ).toBeInTheDocument()
  })

  it('불러오지 못하면 이유와 다시 시도를 보여 준다', async () => {
    server.use(
      http.get('*/api/users/me/badges', () =>
        HttpResponse.json({ status: 500, title: 'Internal Server Error' }, { status: 500 }),
      ),
    )
    renderAt('/me/badges')
    expect(
      await screen.findByRole('button', { name: '다시 시도' }, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '배지' })).toBeInTheDocument()
  })

  it('내 학습 탭: 배지가 지금 화면이고 학습 리포트로 갈 수 있다', async () => {
    serveBadges()
    renderAt('/me/badges')
    const nav = await screen.findByRole('navigation', { name: '내 학습 메뉴' })
    expect(within(nav).getByRole('link', { name: '배지' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: '학습 리포트' })).toHaveAttribute(
      'href',
      '/me/report',
    )
  })
})

describe('BadgeCelebrator (BADGE-03)', () => {
  it('내 제출의 채점이 끝나면 축하 전 배지를 띄우고 띄운 배지를 서버에 알린다', async () => {
    const celebrated = serveBadges(['STREAK_3'])
    const { client } = renderAt('/submissions/1')
    await submitLikeSolvePage(client)

    const dialog = await screen.findByRole('dialog', { name: "'3일 연속' 배지를 받았어요" })
    expect(dialog).toHaveAccessibleDescription('3일 연속으로 제출했어요.')
    await waitFor(() => expect(celebrated).toEqual(['STREAK_3']))

    await userEvent.click(within(dialog).getByRole('button', { name: '확인' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('축하 전 배지가 없으면 채점이 끝나도 띄우지 않는다', async () => {
    let asked = 0
    server.use(
      http.get('*/api/users/me/badges', () => {
        asked++
        return HttpResponse.json({ badges: badgesFor(1) })
      }),
    )
    const { client } = renderAt('/submissions/1')
    await submitLikeSolvePage(client)

    await waitFor(() => expect(asked).toBe(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // 결과 화면으로 넘어가면 제출 mutation은 관찰자가 없어 5분 뒤 지워진다. 채점이 그보다 오래 걸린 경우다
  it('채점 중에 제출 기록이 캐시에서 지워져도 끝까지 지켜본다', async () => {
    serveBadges(['STREAK_3'])
    // 목은 몇 번 만에 채점을 끝낸다. 지우기 전에 끝나면 이 경우가 아니므로 풀어 줄 때까지 채점 중으로 둔다.
    // 풀면 아무것도 돌려주지 않아 기본 핸들러(채점이 나아감)로 넘긴다
    let judging = true
    let polled = 0
    server.use(
      http.get('*/api/submissions/:id', () => {
        polled++
        return judging ? HttpResponse.json({ id: 1, status: 'RUNNING', progress: 50 }) : undefined
      }),
    )
    const { client } = renderAt('/submissions/1')
    await submitLikeSolvePage(client)
    await waitFor(() => expect(polled).toBeGreaterThan(0))
    // 5분 뒤의 정리(gc)와 같은 remove로 지운다. clear()는 알린 뒤에 비워서 useMutationState가 바뀌지 않는다
    const mutations = client.getMutationCache()
    mutations.getAll().forEach((m) => mutations.remove(m))
    judging = false

    expect(
      await screen.findByRole('dialog', { name: "'3일 연속' 배지를 받았어요" }),
    ).toBeInTheDocument()
  })

  // 배지 화면이 열려 있어 같은 키를 조회 중일 때다. 그 응답에는 방금 끝난 채점으로 받은 배지가 없다.
  // 늦게 도착한 그 옛 응답이 화면을 덮어 방금 축하한 배지를 잠긴 채로 되돌려서도 안 된다(2차 리뷰)
  it('진행 중인 배지 조회를 함께 쓰지 않고, 늦게 온 옛 응답이 화면을 덮지 않는다', async () => {
    let calls = 0
    let heldDone = false
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get('*/api/users/me/badges', async () => {
        calls++
        if (calls === 1) {
          await held
          heldDone = true
          return HttpResponse.json({ badges: badgesFor(1) })
        }
        return HttpResponse.json({
          badges: badgesFor(1).map((b) =>
            b.code === 'FIRST_TRY'
              ? { ...b, unlockedAt: '2026-11-15T01:00:00Z', celebrated: false }
              : b,
          ),
        })
      }),
      http.post(
        '*/api/users/me/badges/:code/celebrated',
        () => new HttpResponse(null, { status: 204 }),
      ),
    )
    const { client } = renderAt('/me/badges')
    await waitFor(() => expect(calls).toBe(1))
    await submitLikeSolvePage(client)

    const dialog = await screen.findByRole('dialog', { name: "'한 번에 맞힘' 배지를 받았어요" })
    await userEvent.click(within(dialog).getByRole('button', { name: '확인' }))

    release()
    await waitFor(() => expect(heldDone).toBe(true))
    // 옛 응답이 캐시에 들어갈 틈을 준 뒤 본다
    await new Promise((resolve) => setTimeout(resolve, 200))
    const card = within(screen.getByRole('region', { name: '실력' }))
      .getAllByRole('listitem')
      .find((li) => li.textContent?.startsWith('한 번에 맞힘'))
    expect(card).toHaveTextContent('2026.11.15 획득')
  })

  it('로그아웃 뒤 도착한 배지 응답은 캐시에 넣지 않는다', async () => {
    let asked = false
    let answered = false
    let release = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.get('*/api/users/me/badges', async () => {
        asked = true
        await held
        answered = true
        return HttpResponse.json({ badges: badgesFor(1) })
      }),
    )
    const { client } = renderAt('/submissions/1')
    await submitLikeSolvePage(client)
    await waitFor(() => expect(asked).toBe(true))

    // 로그아웃하면 축하 창이 사라진다. 다음 사람이 로그인하기 전에 앞사람의 응답이 온다
    // TanStack은 캐시 변화를 다음 틱에 화면에 알린다(notifyManager). 축하 창이 사라진 뒤에 응답을 푼다
    await act(async () => {
      client.setQueryData(ME_QUERY_KEY, null)
      await new Promise((resolve) => setTimeout(resolve, 50))
    })
    release()
    await waitFor(() => expect(answered).toBe(true))
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(client.getQueryData(['badges'])).toBeUndefined()
  })

  it('세션이 끊겨 배지 조회가 401이면 세션을 버린다', async () => {
    server.use(
      http.get('*/api/submissions/:id', () =>
        HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
      ),
      http.get('*/api/users/me/badges', () =>
        HttpResponse.json({ status: 401, title: 'Unauthorized' }, { status: 401 }),
      ),
    )
    const { client } = renderAt('/submissions/1')
    await submitLikeSolvePage(client)

    await waitFor(() => expect(client.getQueryData(ME_QUERY_KEY)).toBeNull())
  })

  // 첫 조회가 503이면 폴링이 멈춘다(isDeadEnd). 남겨 두면 다시 묻지도, 배지를 보지도 않는다
  it('채점 조회가 포기되면 그 제출을 내려놓고 배지를 한 번 본다', async () => {
    serveBadges(['STREAK_3'])
    server.use(
      http.get('*/api/submissions/:id', () =>
        HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 }),
      ),
    )
    const { client } = renderAt('/submissions/1')
    await submitLikeSolvePage(client)

    expect(
      await screen.findByRole('dialog', { name: "'3일 연속' 배지를 받았어요" }),
    ).toBeInTheDocument()
    // 내려놓았으니 그 제출을 지켜보는 쿼리 관찰자가 없다
    await waitFor(() =>
      expect(
        client
          .getQueryCache()
          .find({ queryKey: ['submission', 1] })
          ?.getObserversCount(),
      ).toBe(0),
    )
  })

  it('웹이 모르는 배지 코드는 띄우지 않는다', async () => {
    let asked = 0
    server.use(
      http.get('*/api/users/me/badges', () => {
        asked++
        return HttpResponse.json({
          badges: [
            ...badgesFor(1),
            { code: 'NEW_FROM_SERVER', unlockedAt: '2026-11-15T01:00:00Z', celebrated: false },
            // 프로토타입 키도 모르는 코드다(`in`이면 통과한다)
            { code: 'constructor', unlockedAt: '2026-11-15T01:00:00Z', celebrated: false },
          ],
        })
      }),
    )
    const { client } = renderAt('/submissions/1')
    await submitLikeSolvePage(client)

    await waitFor(() => expect(asked).toBe(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('결과 화면을 떠나도 채점이 끝나면 지금 화면 위에 띄운다', async () => {
    serveBadges(['STREAK_3'])
    const { client, router } = renderAt('/submissions/1')
    await submitLikeSolvePage(client)
    await router.navigate('/problems')

    expect(await screen.findByRole('heading', { name: '문제 목록' })).toBeInTheDocument()
    expect(
      await screen.findByRole('dialog', { name: "'3일 연속' 배지를 받았어요" }),
    ).toBeInTheDocument()
  })

  it('배지가 여럿이면 하나씩 띄우고, [배지 보기]는 배지 화면으로 간다', async () => {
    serveBadges(['STREAK_3', 'FIRST_TRY'])
    const { client, router } = renderAt('/submissions/1')
    await submitLikeSolvePage(client)

    const first = await screen.findByRole('dialog', { name: "'3일 연속' 배지를 받았어요" })
    await userEvent.click(within(first).getByRole('button', { name: '확인' }))
    const second = await screen.findByRole('dialog', { name: "'한 번에 맞힘' 배지를 받았어요" })
    await userEvent.click(within(second).getByRole('button', { name: '배지 보기' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/me/badges'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('기록에서 연 끝난 제출(내가 이번에 낸 제출이 아님)로는 배지를 묻지 않는다', async () => {
    let asked = 0
    server.use(
      http.get('*/api/users/me/badges', () => {
        asked++
        return HttpResponse.json({ badges: badgesFor(1) })
      }),
    )
    const { client } = renderAt('/submissions/1')
    // 결과 화면이 하듯 끝난 제출을 받아 둔다
    client.setQueryData(['submission', 91], { status: 'COMPLETED' })
    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(asked).toBe(0)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
