import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Verdict } from '@/components/Verdict'
import { Badge } from '@/components/ui/badge'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Card } from '@/components/ui/card'
import { Table } from '@/components/ui/data-table'
import { Icon } from '@/components/ui/icon'
import { SectionHeading } from '@/components/ui/section-heading'
import { StatCard } from '@/components/ui/stat-card'

describe('Badge', () => {
  it('tone이 없으면 neutral, 있으면 그 색을 입힌다', () => {
    const { rerender } = render(<Badge>배열</Badge>)
    expect(screen.getByText('배열')).toHaveClass('text-muted-foreground')

    rerender(<Badge tone="success">3개</Badge>)
    expect(screen.getByText('3개')).toHaveClass('bg-success-soft', 'text-success-text')
  })
})

describe('Verdict', () => {
  it('판정 이름과 색은 VERDICT_INFO를 따르고 아이콘은 숨긴다', () => {
    const { container } = render(<Verdict verdict="TIME_LIMIT_EXCEEDED" />)

    expect(screen.getByText('시간 초과')).toHaveClass('text-warning-text')
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('lg는 결과 화면 제목 크기이고 children이 이름을 덮는다', () => {
    render(
      <Verdict verdict="ACCEPTED" size="lg">
        통과!
      </Verdict>,
    )

    expect(screen.getByText('통과!')).toHaveClass('text-2xl')
  })

  it('채점 중은 info 색에 돌아가는 아이콘이다', () => {
    const { container } = render(<Verdict verdict="JUDGING" />)

    expect(screen.getByText('채점 중')).toHaveClass('text-info-text')
    expect(container.querySelector('svg')).toHaveClass('animate-spin')
  })

  it('채점 불가는 판정 색 없이 아이콘도 없다', () => {
    const { container } = render(<Verdict verdict="JUDGE_ERROR" />)

    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('Card', () => {
  it('tone·padding을 클래스로, as="a"면 링크로 그린다', () => {
    render(
      <Card as="a" href="/p/1" tone="elevated" padding="lg" interactive>
        문제
      </Card>,
    )

    const card = screen.getByRole('link', { name: '문제' })
    expect(card).toHaveClass('shadow-card', 'p-8', 'hover:-translate-y-1')
  })
})

describe('StatCard', () => {
  it('값·단위·변화량·기간을 보여 주고 inverse는 남색 면이다', () => {
    const { container } = render(
      <StatCard label="푼 문제" value={12} unit="개" delta="+3" hint="이번 주" tone="inverse" />,
    )

    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('개')).toBeInTheDocument()
    expect(screen.getByText('+3')).toHaveClass('text-highlight')
    expect(container.firstChild).toHaveClass('bg-inverse')
  })
})

describe('SectionHeading', () => {
  it('제목 태그를 고르고 소제목·설명·버튼 묶음을 보여 준다', () => {
    render(
      <SectionHeading
        as="h1"
        eyebrow="시작하기"
        title="오늘의 문제"
        description="차근차근"
        actions={<button type="button">풀기</button>}
      />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '오늘의 문제' })).toBeInTheDocument()
    expect(screen.getByText('시작하기')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '풀기' })).toBeInTheDocument()
  })
})

describe('Breadcrumb', () => {
  it('마지막은 현재 화면이라 링크 없이 aria-current다', () => {
    render(
      <MemoryRouter>
        <Breadcrumb
          items={[
            { label: '문제', href: '/problems' },
            { label: '목록', href: '/p' },
            { label: '1번' },
          ]}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('navigation', { name: '현재 위치' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '문제' })).toHaveAttribute('href', '/problems')
    expect(screen.getByText('1번')).toHaveAttribute('aria-current', 'page')
  })
})

describe('Icon', () => {
  it('label이 없으면 장식, 있으면 이미지로 읽힌다', () => {
    const { container, rerender } = render(<Icon name="check" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')

    rerender(<Icon name="check" label="완료" />)
    expect(screen.getByRole('img', { name: '완료' })).toBeInTheDocument()
  })
})

describe('Table (데이터형)', () => {
  const rows = [
    { id: 1, title: '두 수의 합' },
    { id: 2, title: '배열 뒤집기' },
  ]

  it('columns·rows로 그리고 render가 없으면 값을 그대로, 있으면 render를 쓴다', () => {
    render(
      <Table
        caption="문제"
        columns={[
          { key: 'id', header: '번호', align: 'right' },
          { key: 'title', header: '제목', render: (r) => <b>{r.title}!</b> },
        ]}
        rows={rows}
      />,
    )

    expect(screen.getByRole('table', { name: '문제' })).toBeInTheDocument()
    expect(screen.getByText('2')).toHaveClass('text-right')
    expect(screen.getByText('두 수의 합!')).toBeInTheDocument()
  })

  it('정렬 중인 열에 aria-sort를 달고, 행 클릭을 알린다', async () => {
    const onRowClick = vi.fn()
    render(
      <Table
        columns={[{ key: 'title', header: '제목', ariaSort: 'ascending' }]}
        rows={rows}
        onRowClick={onRowClick}
      />,
    )

    expect(screen.getByRole('columnheader', { name: '제목' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
    await userEvent.click(screen.getByText('배열 뒤집기'))
    expect(onRowClick).toHaveBeenCalledWith(rows[1])
  })
})
