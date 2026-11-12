import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Verdict } from '@/components/Verdict'
import { STATUS_LABEL } from '@/constants/verdicts'
import { Badge } from '@/components/ui/badge'
import { Breadcrumb } from '@/components/ui/breadcrumb'
import { Card } from '@/components/ui/card'
import { Table, type TableColumn } from '@/components/ui/data-table'
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

  it('채점 중은 info 색에 정보(i)가 아니라 로딩 아이콘이 돈다', () => {
    const { container } = render(<Verdict verdict="JUDGING" />)

    expect(screen.getByText(STATUS_LABEL.RUNNING)).toHaveClass('text-info-text')
    const icon = container.querySelector('svg')
    expect(icon).toHaveClass('animate-spin', 'lucide-loader-circle')
  })

  it('채점 불가는 판정 색 없이 아이콘도 없다', () => {
    const { container } = render(<Verdict verdict="JUDGE_ERROR" />)

    expect(container.querySelector('svg')).toBeNull()
  })
})

describe('Card', () => {
  it('as="a"면 앱 안 링크(react-router)로, 블록으로 그리고 떠오르기에 translate 전환이 있다', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <Card as="a" href="/p/1" tone="elevated" padding="lg" interactive>
                문제
              </Card>
            }
          />
          <Route path="/p/1" element={<p>문제 화면</p>} />
        </Routes>
      </MemoryRouter>,
    )

    const card = screen.getByRole('link', { name: '문제' })
    expect(card).toHaveAttribute('href', '/p/1')
    expect(card).toHaveClass('block', 'shadow-card', 'p-8', 'hover:-translate-y-1')
    expect(card.className).toContain('translate]')
    await user.click(card)
    // 문서를 다시 불러오지 않고 라우터가 화면을 바꾼다
    expect(screen.getByText('문제 화면')).toBeInTheDocument()
  })

  it('링크가 아닌 카드는 떠오르기 효과를 받지 않는다', () => {
    render(<Card tone="subtle">묶음</Card>)

    expect(screen.getByText('묶음')).toHaveClass('bg-muted', 'p-6')
    expect(screen.getByText('묶음')).not.toHaveClass('cursor-pointer')
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

  // tailwind-merge는 text-title-*를 색으로 보아 text-foreground를 지운다. 그러면 본문색 카드 안에서 제목이 흐려진다
  it('제목은 크기와 제목색을 함께 가진다', () => {
    const { rerender } = render(<SectionHeading title="제목" />)
    expect(screen.getByRole('heading', { name: '제목' })).toHaveClass(
      'text-foreground',
      'text-title-1',
    )

    rerender(<SectionHeading title="제목" size="sm" />)
    expect(screen.getByRole('heading', { name: '제목' })).toHaveClass(
      'text-foreground',
      'text-title-2',
    )
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

  it('행 클릭이 있으면 Tab으로 행에 닿고 Enter·Space로 연다', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    render(
      <Table columns={[{ key: 'title', header: '제목' }]} rows={rows} onRowClick={onRowClick} />,
    )

    await user.tab()
    expect(screen.getByText('두 수의 합').closest('tr')).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(onRowClick).toHaveBeenLastCalledWith(rows[0])

    await user.tab()
    await user.keyboard(' ')
    expect(onRowClick).toHaveBeenLastCalledWith(rows[1])
    expect(onRowClick).toHaveBeenCalledTimes(2)
  })

  it('행 클릭이 없으면 행은 Tab 순서에 들어가지 않는다', () => {
    render(<Table columns={[{ key: 'title', header: '제목' }]} rows={rows} />)

    expect(screen.getByText('두 수의 합').closest('tr')).not.toHaveAttribute('tabindex')
  })

  it('칸 안 버튼을 누르면 버튼 동작만 하고 행 클릭은 하지 않는다', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    const onDelete = vi.fn()
    render(
      <Table
        columns={[
          { key: 'title', header: '제목' },
          {
            key: 'actions',
            header: '',
            render: () => (
              <button type="button" onClick={onDelete}>
                삭제
              </button>
            ),
          },
        ]}
        rows={rows.slice(0, 1)}
        onRowClick={onRowClick}
      />,
    )

    await user.click(screen.getByRole('button', { name: '삭제' }))
    expect(onDelete).toHaveBeenCalledOnce()
    expect(onRowClick).not.toHaveBeenCalled()

    // 버튼에 포커스를 두고 Enter를 눌러도 행은 열리지 않는다
    await user.keyboard('{Enter}')
    expect(onDelete).toHaveBeenCalledTimes(2)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('render 없는 열의 객체 값은 렌더를 깨지 않고 글자로 나온다', () => {
    const data = [{ id: 1, meta: { a: 1 }, none: null }]
    render(
      <Table
        columns={[
          { key: 'meta', header: '메타' },
          { key: 'none', header: '빈 값' },
        ]}
        rows={data}
      />,
    )

    expect(screen.getByText('[object Object]')).toBeInTheDocument()
  })

  it('render 없는 열의 key는 행의 필드 이름이어야 한다 (타입 검사)', () => {
    const columns: TableColumn<(typeof rows)[number]>[] = [
      // @ts-expect-error 오타 난 필드 이름은 빈 칸으로 조용히 나오지 않고 타입 오류가 된다
      { key: 'titel', header: '제목' },
      { key: 'anything', header: '열 이름', render: (r) => r.title },
    ]
    expect(columns).toHaveLength(2)
  })
})
