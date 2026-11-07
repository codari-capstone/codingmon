import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import { getAccessToken, getGeneration, setAccessToken } from '@/api/session'
import type { CurrentUser } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { PASSWORD_CHANGED_NOTICE } from '@/features/auth/accountRules'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { readSavedCode, storeSavedCode } from '@/features/solve/savedCode'
import { server } from '@/mocks/server'
import { NicknameForm, PasswordForm, WithdrawSection } from './AccountSettings'

const ALICE: CurrentUser = {
  id: 1,
  nickname: 'alice',
  role: 'USER',
  avatarUrl: null,
  email: 'al***@codari.test',
  loginMethod: 'EMAIL',
  githubUsername: null,
}

const problem = (status: number, code: string, detail: string) =>
  HttpResponse.json({ status, code, detail }, { status })

function renderWith(element: React.ReactNode, user: CurrentUser = ALICE) {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, user)
  const router = createMemoryRouter(
    [
      { path: '/me', element },
      { path: '/login', element: <h1>로그인 도착</h1> },
      { path: '/problems', element: <h1>문제 목록 도착</h1> },
    ],
    { initialEntries: ['/me'] },
  )
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { client, router }
}

afterEach(() => setAccessToken(null))

describe('닉네임 변경 (MY-02)', () => {
  it('중복 확인을 통과하면 저장하고, 상단 메뉴가 쓰는 사용자 정보도 바꾼다', async () => {
    server.use(
      http.get('*/api/auth/nickname-availability', () => HttpResponse.json({ available: true })),
      http.patch('*/api/users/me', async ({ request }) => {
        const { nickname } = (await request.json()) as { nickname: string }
        return HttpResponse.json({ ...ALICE, nickname })
      }),
    )
    const user = userEvent.setup()
    const { client } = renderWith(<NicknameForm user={ALICE} />)

    const save = screen.getByRole('button', { name: '저장' })
    await user.type(screen.getByLabelText('닉네임'), 'bob99')
    expect(save).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '중복 확인' }))
    await screen.findByText('쓸 수 있어요')
    await user.click(save)

    expect(await screen.findByText('닉네임을 바꿨어요')).toBeInTheDocument()
    expect(client.getQueryData<CurrentUser>(ME_QUERY_KEY)?.nickname).toBe('bob99')
  })

  it('대소문자만 바꾸면 중복 확인 없이 저장할 수 있다', async () => {
    let checked = false
    server.use(
      http.get('*/api/auth/nickname-availability', () => {
        checked = true
        return HttpResponse.json({ available: false })
      }),
      http.patch('*/api/users/me', () => HttpResponse.json({ ...ALICE, nickname: 'Alice' })),
    )
    const user = userEvent.setup()
    renderWith(<NicknameForm user={ALICE} />)

    await user.type(screen.getByLabelText('닉네임'), 'Alice')
    expect(screen.getByRole('button', { name: '중복 확인' })).toBeDisabled()
    expect(screen.getByText(/대소문자만 바뀌어/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByText('닉네임을 바꿨어요')).toBeInTheDocument()
    expect(checked).toBe(false)
  })

  it('저장하는 사이 선점됐으면 서버 문구를 보이고 다시 확인해야 저장된다', async () => {
    server.use(
      http.get('*/api/auth/nickname-availability', () => HttpResponse.json({ available: true })),
      http.patch('*/api/users/me', () =>
        problem(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임이에요'),
      ),
    )
    const user = userEvent.setup()
    renderWith(<NicknameForm user={ALICE} />)

    await user.type(screen.getByLabelText('닉네임'), 'bob99')
    await user.click(screen.getByRole('button', { name: '중복 확인' }))
    await screen.findByText('쓸 수 있어요')
    await user.click(screen.getByRole('button', { name: '저장' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 사용 중인 닉네임이에요')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    expect(screen.getByLabelText('닉네임')).toHaveFocus()
  })

  // #189 리뷰: 다시 확인해도 지난 저장 실패 문구가 남아 '쓸 수 있어요'와 함께 보였다
  it('선점된 뒤 다시 중복 확인하면 지난 저장 실패 문구를 지운다', async () => {
    let available = true
    server.use(
      http.get('*/api/auth/nickname-availability', () => HttpResponse.json({ available })),
      http.patch('*/api/users/me', () =>
        problem(409, 'NICKNAME_TAKEN', '이미 사용 중인 닉네임이에요'),
      ),
    )
    const user = userEvent.setup()
    renderWith(<NicknameForm user={ALICE} />)

    await user.type(screen.getByLabelText('닉네임'), 'bob99')
    await user.click(screen.getByRole('button', { name: '중복 확인' }))
    await screen.findByText('쓸 수 있어요')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByRole('alert')

    available = false
    await user.click(screen.getByRole('button', { name: '중복 확인' }))

    // 확인 결과 문구 하나만 남는다(저장 실패 문구와 겹치지 않는다)
    await waitFor(() => expect(screen.getAllByRole('alert')).toHaveLength(1))
    expect(screen.getByRole('alert')).toHaveTextContent('이미 사용 중인 닉네임이에요')
  })

  // #189 리뷰: 저장 중 입력을 고치면 reset()이 '진행 중'을 지워 두 번째 PATCH가 나갔다
  it('저장 요청이 오가는 중에 입력을 고쳐도 다시 저장되지 않는다', async () => {
    let patches = 0
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    server.use(
      http.patch('*/api/users/me', async () => {
        patches += 1
        await held
        return HttpResponse.json({ ...ALICE, nickname: 'Alice' })
      }),
    )
    const user = userEvent.setup()
    renderWith(<NicknameForm user={ALICE} />)

    const input = screen.getByLabelText('닉네임')
    await user.type(input, 'Alice')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(patches).toBe(1))

    await user.clear(input)
    await user.type(input, 'ALICE')
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '저장' }))

    release()
    expect(await screen.findByText('닉네임을 바꿨어요')).toBeInTheDocument()
    expect(patches).toBe(1)
  })
})

describe('비밀번호 변경 (MY-03)', () => {
  const fill = async (user: ReturnType<typeof userEvent.setup>, current: string, next: string) => {
    await user.type(screen.getByLabelText('현재 비밀번호'), current)
    await user.type(screen.getByLabelText('새 비밀번호'), next)
    await user.type(screen.getByLabelText('새 비밀번호 확인'), next)
  }

  it('바꾸면 세션을 끝내고(다른 탭에도 알림) 로그인 화면으로 가서 안내를 띄운다', async () => {
    server.use(http.put('*/api/users/me/password', () => new HttpResponse(null, { status: 204 })))
    setAccessToken('old-token')
    const before = getGeneration()
    const user = userEvent.setup()
    const { router } = renderWith(<PasswordForm user={ALICE} />)

    await fill(user, 'Codari!test1', 'Codari!next2')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByRole('heading', { name: '로그인 도착' })).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ notice: PASSWORD_CHANGED_NOTICE })
    expect(getAccessToken()).toBeNull()
    // endSession(): 세대가 올라 늦게 오는 갱신 응답이 세션을 되살리지 못한다
    expect(getGeneration()).toBeGreaterThan(before)
  })

  it('현재 비밀번호가 틀리면 서버 문구를 보이고 화면에 남는다 (401이 아니다)', async () => {
    server.use(
      http.put('*/api/users/me/password', () =>
        problem(400, 'WRONG_PASSWORD', '현재 비밀번호가 맞지 않아요'),
      ),
    )
    const user = userEvent.setup()
    renderWith(<PasswordForm user={ALICE} />)

    await fill(user, 'Wrong!pass1', 'Codari!next2')
    await user.click(screen.getByRole('button', { name: '비밀번호 변경' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('현재 비밀번호가 맞지 않아요')
    expect(screen.getByLabelText('현재 비밀번호')).toBeInTheDocument()
  })

  it('새 비밀번호가 현재와 같으면 안내하고 버튼을 끈다', async () => {
    const user = userEvent.setup()
    renderWith(<PasswordForm user={ALICE} />)

    await fill(user, 'Codari!test1', 'Codari!test1')
    expect(screen.getByText('현재 비밀번호와 달라야 해요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeDisabled()
  })

  it('GitHub 가입자에게는 입력 칸 없이 꺼진 버튼과 이유를 보여 준다', () => {
    const github: CurrentUser = {
      ...ALICE,
      email: null,
      loginMethod: 'GITHUB',
      githubUsername: 'alice',
    }
    renderWith(<PasswordForm user={github} />, github)

    expect(screen.getByText('GitHub로 로그인한 계정은 비밀번호가 없어요')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '비밀번호 변경' })).toBeDisabled()
    expect(screen.queryByLabelText('현재 비밀번호')).not.toBeInTheDocument()
  })
})

describe('회원 탈퇴 (MY-04)', () => {
  it('관리자에게는 보여 주지 않는다', () => {
    const admin: CurrentUser = { ...ALICE, role: 'ADMIN' }
    renderWith(<WithdrawSection user={admin} />, admin)
    expect(screen.queryByRole('button', { name: '회원 탈퇴' })).not.toBeInTheDocument()
  })

  it('확인 문구를 정확히 입력해야 탈퇴되고, 저장한 코드를 지운 뒤 문제 목록으로 간다', async () => {
    server.use(http.delete('*/api/users/me', () => new HttpResponse(null, { status: 204 })))
    storeSavedCode(ALICE.id, 3, 'PYTHON', 'print(1)')
    setAccessToken('old-token')
    const before = getGeneration()
    const user = userEvent.setup()
    renderWith(<WithdrawSection user={ALICE} />)

    await user.click(screen.getByRole('button', { name: '회원 탈퇴' }))
    const confirm = await screen.findByRole('button', { name: '탈퇴' })
    // 띄어쓰기 하나가 달라도 켜지지 않는다
    await user.type(screen.getByLabelText(/그대로 입력해 주세요/), 'alice/탈퇴 하겠습니다')
    expect(confirm).toBeDisabled()
    await user.clear(screen.getByLabelText(/그대로 입력해 주세요/))
    await user.type(screen.getByLabelText(/그대로 입력해 주세요/), 'alice/탈퇴하겠습니다')
    await user.click(confirm)

    expect(await screen.findByRole('heading', { name: '문제 목록 도착' })).toBeInTheDocument()
    expect(readSavedCode(ALICE.id, 3, 'PYTHON')).toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(getGeneration()).toBeGreaterThan(before)
  })

  it('서버가 거절하면 팝업 안에 이유를 보이고 닫지 않는다', async () => {
    server.use(
      http.delete('*/api/users/me', () =>
        problem(403, 'ADMIN_CANNOT_WITHDRAW', '관리자는 탈퇴할 수 없어요'),
      ),
    )
    const user = userEvent.setup()
    renderWith(<WithdrawSection user={ALICE} />)

    await user.click(screen.getByRole('button', { name: '회원 탈퇴' }))
    await user.type(await screen.findByLabelText(/그대로 입력해 주세요/), 'alice/탈퇴하겠습니다')
    await user.click(screen.getByRole('button', { name: '탈퇴' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('관리자는 탈퇴할 수 없어요')
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeInTheDocument())
  })
})
