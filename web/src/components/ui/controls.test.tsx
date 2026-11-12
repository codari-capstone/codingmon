import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import { Field, FieldRow, Input } from '@/components/ui/input'
import { SearchInput } from '@/components/ui/search-input'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

describe('Button', () => {
  it('폼 안에서 type을 안 적으면 제출하지 않는다 (#149)', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <Button>다시 시도</Button>
        <Button type="submit">저장</Button>
      </form>,
    )
    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onSubmit).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('기본은 primary·md이고 알약이다', () => {
    render(<Button>제출하기</Button>)
    const button = screen.getByRole('button', { name: '제출하기' })
    expect(button).toHaveAttribute('data-variant', 'primary')
    expect(button).toHaveAttribute('data-size', 'md')
    expect(button).toHaveClass('rounded-full', 'h-control-md')
  })

  it('loading이면 눌리지 않고 기다리는 중임을 알린다', async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        제출하기
      </Button>,
    )
    const button = screen.getByRole('button', { name: '제출하기' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-busy', 'true')
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('포커스 외곽선을 지우지 않는다 — Tailwind v4의 outline-none은 style을 none으로 고정한다', () => {
    render(<Button>저장</Button>)
    const button = screen.getByRole('button', { name: '저장' })
    expect(button).toHaveClass(
      'outline-hidden',
      'focus-visible:outline-solid',
      'focus-visible:outline-2',
    )
    expect(button).not.toHaveClass('outline-none')
  })

  it('link는 크기 클래스에 밀리지 않고 글자 링크 모양을 지킨다', () => {
    render(<Button variant="link">약관 보기</Button>)
    const button = screen.getByRole('button', { name: '약관 보기' })
    expect(button).toHaveClass('px-0.5', 'h-auto')
    expect(button).not.toHaveClass('px-6')
    expect(button).not.toHaveClass('h-control-md')
  })

  it('asChild도 disabled를 자식에게 넘긴다', () => {
    render(
      <Button asChild disabled>
        <button type="button">자식 버튼</button>
      </Button>,
    )
    expect(screen.getByRole('button', { name: '자식 버튼' })).toBeDisabled()
  })

  it('asChild는 링크에 모양만 입힌다', () => {
    render(
      <Button asChild variant="secondary">
        <a href="/problems">문제 목록</a>
      </Button>,
    )
    expect(screen.getByRole('link', { name: '문제 목록' })).toHaveAttribute(
      'data-variant',
      'secondary',
    )
  })
})

describe('입력류', () => {
  it('Field는 라벨과 칸을 잇고, 오류가 있으면 도움말 대신 role=alert로 알린다', () => {
    const { rerender } = render(
      <Field label="닉네임" htmlFor="nick" hint="2~16자">
        <Input id="nick" />
      </Field>,
    )
    expect(screen.getByLabelText('닉네임')).toBeInTheDocument()
    expect(screen.getByText('2~16자')).toBeInTheDocument()
    expect(screen.getByLabelText('닉네임')).toHaveAccessibleDescription('2~16자')
    expect(screen.queryByRole('alert')).toBeNull()

    rerender(
      <Field label="닉네임" htmlFor="nick" hint="2~16자" error="이미 쓰는 닉네임이에요">
        <Input id="nick" aria-invalid />
      </Field>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('이미 쓰는 닉네임이에요')
    expect(screen.queryByText('2~16자')).toBeNull()
    expect(screen.getByLabelText('닉네임')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('닉네임')).toHaveAccessibleDescription('이미 쓰는 닉네임이에요')
  })

  it('FieldRow 안의 칸은 늘어나고 버튼은 바닥에 맞춘다', () => {
    render(
      <FieldRow>
        <Field label="닉네임" htmlFor="nick">
          <Input id="nick" />
        </Field>
        <Button variant="secondary">중복 확인</Button>
      </FieldRow>,
    )
    expect(screen.getByRole('button', { name: '중복 확인' }).parentElement).toHaveClass('items-end')
  })

  it('Textarea·Select·SearchInput은 값을 받고 보낸다', async () => {
    const onSearch = vi.fn()
    render(
      <>
        <label htmlFor="memo">메모</label>
        <Textarea id="memo" />
        <label htmlFor="level">난이도</label>
        <Select id="level" defaultValue="EASY">
          <option value="EASY">쉬움</option>
          <option value="HARD">어려움</option>
        </Select>
        <SearchInput
          aria-label="문제 찾기"
          shortcut="/"
          onChange={(e) => onSearch(e.target.value)}
        />
      </>,
    )
    await userEvent.type(screen.getByLabelText('메모'), '안녕')
    expect(screen.getByLabelText('메모')).toHaveValue('안녕')
    await userEvent.selectOptions(screen.getByLabelText('난이도'), 'HARD')
    expect(screen.getByLabelText('난이도')).toHaveValue('HARD')
    await userEvent.type(screen.getByRole('searchbox', { name: '문제 찾기' }), 'ab')
    expect(onSearch).toHaveBeenLastCalledWith('ab')
    expect(screen.getByText('/')).toBeInTheDocument()
  })
})
