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

  // 운영에서 펼쳐 볼 수 있으면 예외 클래스명·SQL 조각·내부 호스트명이 새어 나간다
  it('운영 빌드에서는 서버 응답 원문을 아예 만들지 않는다', () => {
    vi.stubEnv('DEV', false)

    render(<ErrorState problem={judgeDown} />)

    expect(screen.queryByText('서버 응답 원문')).not.toBeInTheDocument()
    expect(screen.queryByText(/Judge0 queue is not reachable/)).not.toBeInTheDocument()
    // 사용자 문구는 그대로 나온다
    expect(screen.getByRole('heading', { name: '지금은 제출할 수 없습니다' })).toBeInTheDocument()

    vi.unstubAllEnvs()
  })

  // 영어 기술 문장이 본문에 노출되면 안 되지만, 팀이 원인을 보려면 접근은 돼야 한다
  it('개발 모드에서는 서버 응답 원문을 접어서 보여 준다', () => {
    render(<ErrorState problem={judgeDown} />)

    expect(screen.getByText('서버 응답 원문')).toBeInTheDocument()
    expect(screen.getByText(/Judge0 queue is not reachable/)).toBeInTheDocument()
  })

  it('원문이 없으면 접는 영역을 만들지 않는다', () => {
    render(<ErrorState problem={undefined} />)

    expect(screen.queryByText('서버 응답 원문')).not.toBeInTheDocument()
  })

  // JSON.stringify(new Error(...))는 "{}"다. 그것을 원문으로 보여 주면 안 된다.
  it('Error 인스턴스는 원문 영역을 만들지 않는다', () => {
    render(<ErrorState problem={new Error('Failed to fetch')} />)

    expect(screen.queryByText('서버 응답 원문')).not.toBeInTheDocument()
  })

  // 스켈레톤이 오류로 바뀌는 순간 스크린 리더가 알아야 한다
  it('라이브 영역으로 알린다', () => {
    render(<ErrorState problem={judgeDown} />)

    expect(screen.getByRole('alert')).toHaveTextContent('지금은 제출할 수 없습니다')
  })

  it('기본 제목은 h2다', () => {
    render(<ErrorState problem={judgeDown} />)

    expect(
      screen.getByRole('heading', { level: 2, name: '지금은 제출할 수 없습니다' }),
    ).toBeInTheDocument()
  })

  // 화면 전체가 오류면 그 화면의 h1이 이 제목이어야 한다
  it('headingLevel 1이면 제목이 h1이 된다', () => {
    render(<ErrorState problem={judgeDown} headingLevel={1} />)

    expect(
      screen.getByRole('heading', { level: 1, name: '지금은 제출할 수 없습니다' }),
    ).toBeInTheDocument()
  })
})
