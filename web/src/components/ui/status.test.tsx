import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { EmptyState } from '@/components/EmptyState'
import { LoadingState } from '@/components/LoadingState'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Heatmap } from '@/components/ui/heatmap'
import { Mascot } from '@/components/ui/mascot'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

describe('Alert', () => {
  it('danger만 role=alert이고 나머지는 status다', () => {
    const { rerender } = render(<Alert tone="danger" title="실패" />)
    expect(screen.getByRole('alert')).toHaveClass('bg-destructive-soft')

    rerender(<Alert tone="success" title="완료" />)
    expect(screen.getByRole('status')).toHaveClass('bg-success-soft')
  })

  it('닫기 버튼은 onClose를 부르고 이름이 있다', async () => {
    const onClose = vi.fn()
    render(<Alert title="안내" onClose={onClose} />)

    await userEvent.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('Progress', () => {
  it('값과 범위를 progressbar로 알린다', () => {
    render(<Progress label="배열" value={6} max={10} />)

    const bar = screen.getByRole('progressbar', { name: '배열' })
    expect(bar).toHaveAttribute('aria-valuenow', '6')
    expect(bar).toHaveAttribute('aria-valuemax', '10')
    expect(bar).not.toHaveAttribute('aria-valuetext')
    expect(bar.firstElementChild).toHaveStyle({ width: '60%' })
  })

  // 막대는 100%로 잘리는데 보조기기는 150을 읽으면 둘이 다르다
  it('범위를 넘는 값은 막대와 aria-valuenow를 같이 자르고 원래 값은 valuetext로 알린다', () => {
    render(<Progress label="배열" value={150} max={100} showValue />)

    const bar = screen.getByRole('progressbar', { name: '배열' })
    expect(bar).toHaveAttribute('aria-valuenow', '100')
    expect(bar).toHaveAttribute('aria-valuetext', '150 / 100')
    expect(bar.firstElementChild).toHaveStyle({ width: '100%' })
    expect(screen.getByText('150 / 100')).toBeInTheDocument()
  })

  it('0이면 최소 폭 없이 빈 막대다', () => {
    render(<Progress label="배열" value={0} />)

    const fill = screen.getByRole('progressbar').firstElementChild
    expect(fill).toHaveStyle({ width: '0%' })
    expect(fill).not.toHaveClass('min-w-2.5')
  })

  // 0/0은 NaN%라 폭이 버려지고 블록이 가득 찬다
  it('max가 0이면(문제가 없는 유형) 가득 찬 막대가 아니라 빈 막대다', () => {
    render(<Progress label="배열" value={0} max={0} showValue />)

    const bar = screen.getByRole('progressbar')
    expect(bar.firstElementChild).toHaveStyle({ width: '0%' })
    expect(bar).toHaveAttribute('aria-valuenow', '0')
  })
})

describe('Heatmap', () => {
  it('값을 0~4단계 칸으로 바꾸고 범례를 뺄 수 있다', () => {
    const { container, rerender } = render(<Heatmap values={[0, 1, 4, 8]} max={8} />)

    const levels = [...container.querySelectorAll('[data-level]')].map((c) =>
      c.getAttribute('data-level'),
    )
    expect(levels).toEqual(['0', '1', '2', '4'])
    expect(screen.getByRole('img', { name: '학습 기록' })).toBeInTheDocument()
    expect(screen.getByText('적음')).toBeInTheDocument()

    rerender(<Heatmap values={[1]} legend={false} />)
    expect(screen.queryByText('적음')).not.toBeInTheDocument()
  })
})

describe('Avatar', () => {
  it('사진이 없으면 이름 첫 글자, 상태는 점의 색과 함께 이름으로도 알린다', () => {
    const { container } = render(<Avatar name="chan" status="away" />)

    const avatar = screen.getByRole('img', { name: 'chan, 자리 비움' })
    expect(avatar).toHaveTextContent('C')
    expect(avatar).toHaveAttribute('title', '자리 비움')
    expect(container.querySelector('[data-status="away"]')).toHaveClass('bg-warning')
  })

  it('이름이 없어도 상태가 있으면 상태를 읽고, 둘 다 없으면 장식이다', () => {
    const { rerender } = render(<Avatar status="online" />)
    expect(screen.getByRole('img', { name: '접속 중' })).toBeInTheDocument()

    rerender(<Avatar />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

describe('Mascot', () => {
  it('label이 없으면 장식이고 원본 비율대로 높이를 계산한다', () => {
    const { container } = render(<Mascot pose="success" size={192} />)

    const img = container.querySelector('img')!
    expect(img).toHaveAttribute('alt', '')
    expect(img).toHaveAttribute('width', '192')
    expect(img).toHaveAttribute('height', '175')
  })

  it('thinking은 hint와 같은 그림이다', () => {
    const { container } = render(
      <>
        <Mascot pose="thinking" />
        <Mascot pose="hint" />
      </>,
    )

    const [a, b] = [...container.querySelectorAll('img')]
    expect(a.getAttribute('src')).toBe(b.getAttribute('src'))
  })

  it('모든 장면·표정의 그림 파일이 실제로 있다', () => {
    const { container } = render(
      <>
        {(
          [
            'hello',
            'hero',
            'front',
            'side',
            'back',
            'studying',
            'solving',
            'ai',
            'ranking',
            'level-up',
            'community',
            'success',
            'incorrect',
            'hint',
            'loading',
            'waiting',
            'empty',
            'error',
            'trophy',
            'retry',
            'idea',
            'skeleton',
            'empty-box',
            'access-denied',
            'maintenance',
            'rest',
            'rocket',
          ] as const
        ).map((p) => (
          <Mascot key={p} pose={p} />
        ))}
        {(
          [
            'happy',
            'excited',
            'focused',
            'curious',
            'surprised',
            'idea',
            'love',
            'tired',
            'sleeping',
            'proud',
          ] as const
        ).map((e) => (
          <Mascot key={e} expression={e} />
        ))}
      </>,
    )

    const srcs = [...container.querySelectorAll('img')].map((i) => i.getAttribute('src'))
    expect(srcs).toHaveLength(37)
    expect(srcs.every(Boolean)).toBe(true)
  })
})

describe('Skeleton', () => {
  it('lines면 문단 모양이고 마지막 줄만 짧다', () => {
    const { container } = render(<Skeleton lines={3} />)

    const rows = container.querySelectorAll('[data-slot="skeleton"]')
    expect(rows).toHaveLength(3)
    expect(rows[2]).toHaveClass('w-3/5')
    expect(rows[0]).toHaveClass('w-full')
  })

  it('circle은 원형이다', () => {
    const { container } = render(<Skeleton circle className="size-10" />)
    expect(container.firstChild).toHaveClass('rounded-full')
  })
})

describe('LoadingState', () => {
  it('기본 문구를 status로 알린다', () => {
    render(<LoadingState />)
    expect(screen.getByRole('status')).toHaveTextContent('불러오는 중…')
  })
})

describe('EmptyState (디자인 props)', () => {
  it('verdict 줄·펭귄 자세·노드 action을 받는다', () => {
    render(
      <MemoryRouter>
        <EmptyState
          pose="success"
          verdict="ACCEPTED"
          title="해결했어요"
          action={<button type="button">다음 문제</button>}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('맞았습니다!!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 문제' })).toBeInTheDocument()
  })

  it('mascot={false}면 펭귄을 그리지 않는다', () => {
    const { container } = render(
      <MemoryRouter>
        <EmptyState mascot={false} title="없음" />
      </MemoryRouter>,
    )
    expect(container.querySelector('img')).toBeNull()
  })
})
