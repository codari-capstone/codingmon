import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { describe, expect, it } from 'vitest'

import type { CurrentUser } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { activityFor, kstYear } from '@/mocks/fixtures/activity'
import { server } from '@/mocks/server'
import { Component as MyPage } from './MyPage'

const EMAIL_USER: CurrentUser = {
  id: 1,
  nickname: '코다리',
  role: 'USER',
  avatarUrl: null,
  email: 'us***@codari.test',
  loginMethod: 'EMAIL',
  githubUsername: null,
  welcomeSeen: true,
}

const GITHUB_USER: CurrentUser = {
  id: 3,
  nickname: '깃허브',
  role: 'USER',
  avatarUrl: 'https://avatars.example/3.png',
  email: null,
  loginMethod: 'GITHUB',
  githubUsername: 'octo-kim',
  welcomeSeen: true,
}

/** `activity`가 숫자면 그 사용자의 fixture, 'error'면 500을 준다. */
function renderMyPage(user: CurrentUser, activity: number | 'error' = user.id) {
  server.use(
    http.get('*/api/users/me/activity', () =>
      activity === 'error'
        ? HttpResponse.json({ status: 500, title: 'x' }, { status: 500 })
        : HttpResponse.json(activityFor(activity)),
    ),
  )
  mountMyPage(user)
}

/** 활동 응답을 테스트가 직접 정했을 때 화면만 그린다. */
function mountMyPage(user: CurrentUser) {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, user)
  const router = createMemoryRouter([{ path: '/me', Component: MyPage }], {
    initialEntries: ['/me'],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return client
}

/** StatCard의 숫자. 이름(span)은 아이콘과 같은 줄 div 안에 있고, 숫자는 그 div 다음 문단이다. */
function statValue(scope: HTMLElement, label: string) {
  return within(scope).getByText(label).closest('div')!.nextElementSibling
}

describe('MyPage 계정 정보 (MY-01)', () => {
  it('이메일 가입자는 가린 이메일과 로그인 방식을 보고, GitHub 아이디는 없다', async () => {
    renderMyPage(EMAIL_USER)
    const account = await screen.findByRole('region', { name: '계정 정보' })

    expect(within(account).getByText('코다리')).toBeInTheDocument()
    expect(within(account).getByText('us***@codari.test')).toBeInTheDocument()
    expect(within(account).getByText('이메일 로그인')).toBeInTheDocument()
    expect(within(account).queryByText(/GitHub/)).not.toBeInTheDocument()
  })

  it('GitHub 가입자는 GitHub 아이디를 보고, 이메일은 없다', async () => {
    renderMyPage(GITHUB_USER, 1)
    const account = await screen.findByRole('region', { name: '계정 정보' })

    expect(within(account).getByText('octo-kim')).toBeInTheDocument()
    expect(within(account).getByText('GitHub 로그인')).toBeInTheDocument()
    expect(within(account).queryByText(/@/)).not.toBeInTheDocument()
  })

  it('프로필 수정은 계정 설정 화면으로 간다', async () => {
    renderMyPage(EMAIL_USER)
    const account = await screen.findByRole('region', { name: '계정 정보' })
    expect(within(account).getByRole('link', { name: '프로필 수정' })).toHaveAttribute(
      'href',
      '/me/account',
    )
    // 계정 설정은 이 화면에 없다(#243)
    expect(screen.queryByLabelText('닉네임')).not.toBeInTheDocument()
  })
})

describe('MyPage 사이드바 (MyNav)', () => {
  it('지금 화면을 표시하고, 메뉴마다 그 화면으로 간다', async () => {
    renderMyPage(EMAIL_USER)
    const nav = await screen.findByRole('navigation', { name: '마이페이지 메뉴' })

    expect(within(nav).getByRole('link', { name: /프로필 · 학습 요약/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    const href = (name: RegExp) => within(nav).getByRole('link', { name }).getAttribute('href')
    expect(href(/계정 설정/)).toBe('/me/account')
    expect(href(/화면 설정/)).toBe('/me/display')
    expect(href(/회원 탈퇴/)).toBe('/me/withdraw')
    expect(within(nav).getByRole('button', { name: /로그아웃/ })).toBeInTheDocument()
  })

  it('관리자에게는 회원 탈퇴 메뉴가 없다', async () => {
    renderMyPage({ ...EMAIL_USER, role: 'ADMIN' })
    const nav = await screen.findByRole('navigation', { name: '마이페이지 메뉴' })
    expect(within(nav).queryByRole('link', { name: /회원 탈퇴/ })).not.toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: /계정 설정/ })).toBeInTheDocument()
  })
})

describe('MyPage 계정 정보 — 서버가 새 필드를 아직 보내지 않을 때 (#185 전)', () => {
  it('빠진 값은 없는 것으로 보고 빈 줄을 그리지 않는다', async () => {
    // 지금 서버의 응답 모양: id·nickname·role·avatarUrl만 온다
    const legacy = { id: 1, nickname: '코다리', role: 'USER', avatarUrl: null } as CurrentUser
    renderMyPage(legacy)
    const account = await screen.findByRole('region', { name: '계정 정보' })

    expect(within(account).getByText('코다리')).toBeInTheDocument()
    expect(within(account).queryByText(/로그인/)).not.toBeInTheDocument()
    expect(within(account).queryByText(/@/)).not.toBeInTheDocument()
    expect(within(account).queryByText(/GitHub/)).not.toBeInTheDocument()
  })
})

describe('MyPage 풀이 요약·활동 기록 (MY-05)', () => {
  const YEAR = kstYear()
  /** 해 고르기 테스트의 '오늘'과 서버의 올해. 목의 제출이 오늘에 맞춰 만들어져 고정한다 */
  const NOW = Date.parse('2026-11-16T03:00:00Z')
  const SERVER_YEAR = 2028

  it('고른 해에는 제출이 없지만 전에 푼 문제가 있으면 그 해를 밝혀 안내한다', async () => {
    server.use(
      http.get('*/api/users/me/activity', () =>
        HttpResponse.json({ ...activityFor(1), days: [], totalActiveDays: 0 }),
      ),
    )
    const client = createQueryClient()
    client.setQueryData(ME_QUERY_KEY, EMAIL_USER)
    const router = createMemoryRouter([{ path: '/me', Component: MyPage }], {
      initialEntries: ['/me'],
    })
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(`${YEAR}년에는 제출한 날이 없어요.`)).toBeInTheDocument()
    expect(screen.queryByText('아직 제출한 문제가 없어요.')).not.toBeInTheDocument()
    expect(statValue(document.body, '맞힌 문제')).toHaveTextContent('7')
  })

  it('맞힌·틀린 수, 활동한 날, 난이도별 맞힌 수와 잔디 요약을 보여 준다', async () => {
    renderMyPage(EMAIL_USER)
    const activity = activityFor(1)

    // 숫자는 응답 뒤에 온다
    await screen.findByText('맞힌 문제')
    expect(statValue(document.body, '맞힌 문제')).toHaveTextContent('7')
    expect(statValue(document.body, '틀린 문제')).toHaveTextContent('3')
    // 활동한 날만 고른 해 안에서 센다(계약). 라벨에 해를 붙인다
    expect(statValue(document.body, `${YEAR}년 활동한 날`)).toHaveTextContent(
      String(activity.totalActiveDays),
    )

    const grass = screen.getByRole('region', { name: '활동 기록' })
    expect(grass).toHaveTextContent(`총 ${activity.totalActiveDays}일`)
    expect(grass).not.toHaveTextContent(/최근|개월/)
    expect(
      within(grass).getByRole('img', {
        name: `${YEAR}년에 ${activity.totalActiveDays}일 제출했어요`,
      }),
    ).toBeInTheDocument()
    // 해가 하나뿐이어도 드롭다운이 있다. 서비스를 시작한 해(2026)부터 올해까지다
    const select = within(grass).getByRole('combobox', { name: '잔디 연도' })
    expect(select).toHaveValue(String(YEAR))
    expect(within(select).getAllByRole('option').at(-1)).toHaveTextContent('2026년')

    // 난이도 막대의 기준은 그 난이도의 공개 중인 문제 수다(#339)
    const byDifficulty = screen.getByRole('region', { name: '난이도별 맞힌 문제' })
    const bars = within(byDifficulty).getAllByRole('progressbar')
    expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual(['쉬움', '보통', '어려움'])
    expect(bars.map((bar) => bar.getAttribute('aria-valuenow'))).toEqual(['4', '2', '1'])
    expect(bars.map((bar) => bar.getAttribute('aria-valuemax'))).toEqual(['24', '18', '9'])
    // 명세 MY-05: 내 학습·제출 기록으로 가는 길
    expect(within(byDifficulty).getByRole('link', { name: /학습 리포트 보기/ })).toHaveAttribute(
      'href',
      '/me/report',
    )
    expect(within(byDifficulty).getByRole('link', { name: /제출 기록 보기/ })).toHaveAttribute(
      'href',
      '/submissions',
    )
  })

  it('제출이 없으면 숫자는 0이고 안내 문구를 띄운다', async () => {
    renderMyPage(EMAIL_USER, 2)
    expect(await screen.findByText('아직 제출한 문제가 없어요.')).toBeInTheDocument()
    expect(statValue(document.body, '맞힌 문제')).toHaveTextContent('0')
    expect(screen.getByRole('img', { name: `${YEAR}년에 0일 제출했어요` })).toBeInTheDocument()
  })

  it('해를 고르면 그 해의 잔디를 받고, 마지막 해는 year 없이 받은 응답의 해다', async () => {
    // 서버의 올해가 2028이라고 둔다. 브라우저 시각이 아니라 응답의 from으로 목록을 만드는지 본다.
    // 목의 제출은 '오늘'에 맞춰 만들어지니 오늘을 고정한다 — 실제 날짜가 2028년이 되면 깨진다(#307 리뷰)
    const asked: (string | null)[] = []
    server.use(
      http.get('*/api/users/me/activity', ({ request }) => {
        const year = new URL(request.url).searchParams.get('year')
        asked.push(year)
        return HttpResponse.json(activityFor(1, NOW, Number(year ?? SERVER_YEAR)))
      }),
    )
    const user = userEvent.setup()
    mountMyPage(EMAIL_USER)

    const select = await screen.findByRole('combobox', { name: '잔디 연도' })
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['2028년', '2027년', '2026년'])
    expect(asked).toEqual([null])

    await user.selectOptions(select, '2026')
    const picked = activityFor(1, NOW, 2026)
    expect(
      await screen.findByRole('img', { name: `2026년에 ${picked.totalActiveDays}일 제출했어요` }),
    ).toBeInTheDocument()
    expect(statValue(document.body, '2026년 활동한 날')).toHaveTextContent(
      String(picked.totalActiveDays),
    )
    expect(asked).toContain('2026')
    // 고르는 동안 드롭다운이 사라지지 않아 포커스를 잃지 않는다
    expect(screen.getByRole('combobox', { name: '잔디 연도' })).toBe(select)

    // 마지막 해로 돌아가면 year 없이 받은 캐시를 다시 쓴다
    await user.selectOptions(select, '2028')
    expect(await screen.findByRole('img', { name: '2028년에 0일 제출했어요' })).toBeInTheDocument()
    expect(asked.filter((year) => year === '2028')).toEqual([])
  })

  it('해를 받는 동안에는 통계 카드도 흐리게 두고 기다림을 알린다', async () => {
    // 잔디만 흐리면 위 카드의 '2028년 활동한 날'이 드롭다운의 2026년과 함께 확정값처럼 보인다(#307 리뷰)
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('*/api/users/me/activity', async ({ request }) => {
        const year = new URL(request.url).searchParams.get('year')
        if (year !== null) await held
        return HttpResponse.json(activityFor(1, NOW, Number(year ?? SERVER_YEAR)))
      }),
    )
    const user = userEvent.setup()
    mountMyPage(EMAIL_USER)

    await user.selectOptions(await screen.findByRole('combobox', { name: '잔디 연도' }), '2026')
    const stats = screen.getByText(`${SERVER_YEAR}년 활동한 날`).closest('[aria-busy]')
    expect(stats).toHaveAttribute('aria-busy', 'true')
    expect(stats).toHaveClass('opacity-60')

    release()
    await screen.findByText('2026년 활동한 날')
    expect(screen.getByText('2026년 활동한 날').closest('[aria-busy]')).toBeNull()
  })

  it('지난 해를 보다 올해 조회만 실패해도 다시 시도로 둘 다 다시 받아 풀린다', async () => {
    // 오류 화면은 두 질의의 오류를 합쳐 보이는데 다시 시도가 고른 해만 받으면 풀리지 않았다(#307 리뷰)
    let failCurrent = false
    server.use(
      http.get('*/api/users/me/activity', ({ request }) => {
        const year = new URL(request.url).searchParams.get('year')
        if (year === null && failCurrent) {
          return HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 })
        }
        return HttpResponse.json(activityFor(1, NOW, Number(year ?? SERVER_YEAR)))
      }),
    )
    const user = userEvent.setup()
    const client = mountMyPage(EMAIL_USER)
    client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } })

    await user.selectOptions(await screen.findByRole('combobox', { name: '잔디 연도' }), '2026')
    await screen.findByRole('img', { name: /^2026년에/ })

    // 다시 연결된 것처럼 둘 다 다시 받는데 올해만 실패한다
    failCurrent = true
    await client.refetchQueries({ queryKey: ['activity'] })
    const retry = await screen.findByRole('button', { name: /다시/ })

    failCurrent = false
    await user.click(retry)
    expect(await screen.findByRole('img', { name: /^2026년에/ })).toBeInTheDocument()
  })

  it('불러오지 못하면 오류와 다시 시도를 보여 준다', async () => {
    renderMyPage(EMAIL_USER, 'error')
    expect(await screen.findByRole('button', { name: /다시/ })).toBeInTheDocument()
  })
})
