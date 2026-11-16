import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { setAccessToken } from '@/api/session'
import { createQueryClient } from '@/app/queryClient'
import { problemDetails } from '@/mocks/fixtures/problemDetails'
import { mockAccessToken } from '@/mocks/fixtures/users'
import { reportsSent, resetReports } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { ReportProblem } from './ReportProblem'

const problem = problemDetails[1]

// 목의 신고 보내기는 토큰으로 신고자를 정한다(코다리)
beforeEach(() => setAccessToken(mockAccessToken(1)))
afterEach(() => {
  setAccessToken(null)
  resetReports()
})

function renderButton() {
  render(
    <QueryClientProvider client={createQueryClient()}>
      <ReportProblem problem={problem} />
    </QueryClientProvider>,
  )
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '문제 신고' }))
  return screen.findByRole('dialog', { name: '문제 신고' })
}

describe('ReportProblem (SOLVE-12)', () => {
  it('문제 제목·버전과 유형 6개를 보이고, 유형과 내용을 채워야 보낼 수 있다', async () => {
    const user = userEvent.setup()
    renderButton()
    const dialog = await openDialog(user)

    expect(dialog).toHaveAccessibleDescription(new RegExp(`${problem.title} v${problem.versionNo}`))
    expect(
      within(dialog)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent),
    ).toEqual([
      '문제 설명 오류',
      '입력/출력 설명 오류',
      '예제 오류',
      '테스트케이스 오류',
      '오탈자',
      '기타',
    ])
    const send = within(dialog).getByRole('button', { name: '신고 보내기' })
    expect(send).toBeDisabled()

    await user.click(within(dialog).getByRole('radio', { name: '예제 오류' }))
    // 공백뿐인 내용은 비었다고 본다(계약: 앞뒤 공백을 지운 뒤 비면 400)
    await user.type(within(dialog).getByLabelText('자세한 내용'), '   ')
    expect(send).toBeDisabled()
    await user.type(within(dialog).getByLabelText('자세한 내용'), '예제 2가 이상해요')
    expect(send).toBeEnabled()
  })

  it('1,000자를 넘으면 보낼 수 없고 글자 수를 위험색으로 알린다', async () => {
    const user = userEvent.setup()
    renderButton()
    const dialog = await openDialog(user)

    await user.click(within(dialog).getByRole('radio', { name: '기타' }))
    const box = within(dialog).getByLabelText('자세한 내용')
    // 1,001자를 한 글자씩 치면 느리다. 붙여 넣는다
    await user.click(box)
    await user.paste('가'.repeat(1001))
    expect(within(dialog).getByText('1,001 / 1,000')).toBeInTheDocument()
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByRole('button', { name: '신고 보내기' })).toBeDisabled()
  })

  it('보내면 유형과 내용이 서버에 가고, 보냈다는 안내로 바뀌며 닫으면 버튼으로 포커스가 돌아온다', async () => {
    const user = userEvent.setup()
    renderButton()
    const dialog = await openDialog(user)

    await user.click(within(dialog).getByRole('radio', { name: '예제 오류' }))
    await user.type(within(dialog).getByLabelText('자세한 내용'), '  예제 2의 출력이 달라요  ')
    await user.click(within(dialog).getByRole('button', { name: '신고 보내기' }))

    const done = await screen.findByRole('dialog', { name: '신고를 보냈어요' })
    expect(done).toHaveAccessibleDescription('알려 주셔서 고마워요. 관리자가 확인하고 고칠게요.')
    expect(reportsSent()).toHaveLength(1)
    expect(reportsSent()[0]).toMatchObject({
      problemId: problem.id,
      type: 'SAMPLE',
      content: '예제 2의 출력이 달라요',
      status: 'RECEIVED',
    })

    await user.click(within(done).getByRole('button', { name: '문제로 돌아가기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '문제 신고' })).toHaveFocus()

    // 다시 열면 새 신고다
    const again = await openDialog(user)
    expect(within(again).getByLabelText('자세한 내용')).toHaveValue('')
  })

  it('서버가 거절하면 그 문구를 보이고, 쓰던 내용은 남긴다', async () => {
    server.use(
      http.post('*/api/problems/:id/reports', () =>
        HttpResponse.json(
          { status: 404, code: 'PROBLEM_NOT_FOUND', detail: '문제를 찾을 수 없어요' },
          { status: 404 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderButton()
    const dialog = await openDialog(user)

    await user.click(within(dialog).getByRole('radio', { name: '오탈자' }))
    await user.type(within(dialog).getByLabelText('자세한 내용'), '오타가 있어요')
    await user.click(within(dialog).getByRole('button', { name: '신고 보내기' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('문제를 찾을 수 없어요')
    expect(within(dialog).getByLabelText('자세한 내용')).toHaveValue('오타가 있어요')
  })

  it('글자 수는 서버처럼 코드 포인트로 센다 — 이모지 하나는 1자다', async () => {
    // string.length는 이모지를 2로 세어 서버가 받는 글을 화면이 막았다(코드 리뷰)
    const user = userEvent.setup()
    renderButton()
    const dialog = await openDialog(user)

    await user.click(within(dialog).getByRole('radio', { name: '기타' }))
    await user.click(within(dialog).getByLabelText('자세한 내용'))
    await user.paste('😀'.repeat(600))
    expect(within(dialog).getByText('600 / 1,000')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '신고 보내기' })).toBeEnabled()
  })

  it('서버 오류를 본 뒤 내용을 고치면 그 오류를 거둔다', async () => {
    server.use(
      http.post('*/api/problems/:id/reports', () =>
        HttpResponse.json({ status: 503, title: 'Service Unavailable' }, { status: 503 }),
      ),
    )
    const user = userEvent.setup()
    renderButton()
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('radio', { name: '오탈자' }))
    await user.type(within(dialog).getByLabelText('자세한 내용'), '오타')
    await user.click(within(dialog).getByRole('button', { name: '신고 보내기' }))
    await within(dialog).findByRole('alert')

    await user.type(within(dialog).getByLabelText('자세한 내용'), '가 있어요')
    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('보내는 중에 닫았다가 그 뒤 성공해도, 다시 열면 새 신고로 시작한다', async () => {
    // 닫을 때만 비우면 닫는 순간에는 아직 성공이 아니라 '보냈어요'가 남았다(코드 리뷰)
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    let sent = false
    server.use(
      http.post('*/api/problems/:id/reports', async () => {
        await held
        sent = true
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const user = userEvent.setup()
    renderButton()
    const dialog = await openDialog(user)
    await user.click(within(dialog).getByRole('radio', { name: '오탈자' }))
    await user.type(within(dialog).getByLabelText('자세한 내용'), '오타가 있어요')
    await user.click(within(dialog).getByRole('button', { name: '신고 보내기' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    release()
    await waitFor(() => expect(sent).toBe(true))
    const again = await openDialog(user)
    expect(within(again).getByLabelText('자세한 내용')).toHaveValue('')
    expect(within(again).getByRole('button', { name: '신고 보내기' })).toBeDisabled()
  })

  it('잘못 닫아도 다시 열면 쓰던 내용이 남아 있다', async () => {
    const user = userEvent.setup()
    renderButton()
    const dialog = await openDialog(user)
    await user.type(within(dialog).getByLabelText('자세한 내용'), '쓰던 중')
    await user.click(within(dialog).getByRole('button', { name: '취소' }))

    const again = await openDialog(user)
    expect(within(again).getByLabelText('자세한 내용')).toHaveValue('쓰던 중')
  })
})
