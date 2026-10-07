import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { ErrorState } from './ErrorState'

const judgeDown = {
  type: '/problems/judge-unavailable',
  title: 'Judge unavailable',
  status: 503,
  detail: 'Judge0 queue is not reachable',
}

describe('ErrorState', () => {
  it('서버 응답을 사용자 문구로 바꿔 보여 준다', () => {
    render(<ErrorState problem={judgeDown} />)

    expect(screen.getByRole('heading', { name: '지금은 제출할 수 없습니다' })).toBeInTheDocument()
    expect(screen.getByText(/시도 횟수에 넣지 않습니다/)).toBeInTheDocument()
  })

  it('onRetry를 주고 다시 시도할 수 있는 오류면 버튼을 보여 준다', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()

    render(<ErrorState problem={judgeDown} onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: '다시 시도' }))

    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('다시 시도해도 같은 오류면 버튼을 보이지 않는다', () => {
    render(<ErrorState problem={{ status: 403 }} onRetry={() => {}} />)

    expect(screen.queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument()
  })

  // 영어 기술 문장이 본문에 노출되면 안 되지만, 팀이 원인을 보려면 접근은 돼야 한다
  it('서버 응답 원문을 접어서 보여 준다', () => {
    render(<ErrorState problem={judgeDown} />)

    expect(screen.getByText('서버 응답 원문')).toBeInTheDocument()
    expect(screen.getByText(/Judge0 queue is not reachable/)).toBeInTheDocument()
  })

  it('원문이 없으면 접는 영역을 만들지 않는다', () => {
    render(<ErrorState problem={undefined} />)

    expect(screen.queryByText('서버 응답 원문')).not.toBeInTheDocument()
  })
})
