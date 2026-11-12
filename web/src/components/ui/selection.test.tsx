import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'

import { Checkbox } from '@/components/ui/checkbox'
import { Radio, RadioGroup } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

describe('Checkbox', () => {
  it('라벨 글자를 눌러도 켜지고, 설명은 이름에 섞이지 않고 설명으로 읽힌다', async () => {
    render(<Checkbox label="배열" description="인덱스로 접근하는 묶음" />)
    const box = screen.getByRole('checkbox', { name: '배열' })
    expect(box).toHaveAccessibleDescription('인덱스로 접근하는 묶음')
    await userEvent.click(screen.getByText('배열'))
    expect(box).toBeChecked()
    expect(screen.getByText('인덱스로 접근하는 묶음')).toBeInTheDocument()
  })

  it('react-hook-form register로 그대로 등록된다 (네이티브 input)', async () => {
    const onSubmit = vi.fn()
    function Form() {
      const { register, handleSubmit } = useForm<{ agree: boolean }>({
        defaultValues: { agree: false },
      })
      return (
        <form onSubmit={handleSubmit((values) => onSubmit(values))}>
          <Checkbox label="동의" {...register('agree')} />
          <button type="submit">보내기</button>
        </form>
      )
    }
    render(<Form />)
    await userEvent.click(screen.getByRole('checkbox', { name: '동의' }))
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(onSubmit).toHaveBeenCalledWith({ agree: true })
  })

  it('고대비(forced-colors)에서는 꾸민 상자를 숨기고 네이티브 input을 드러낸다 (#257 리뷰)', () => {
    render(<Checkbox label="배열" />)
    const input = screen.getByRole('checkbox', { name: '배열' })
    expect(input).toHaveClass('forced-colors:opacity-100', 'forced-colors:static')
    expect(input.nextElementSibling).toHaveClass('forced-colors:hidden')
  })

  it('disabled면 눌러도 바뀌지 않는다', async () => {
    const onChange = vi.fn()
    render(<Checkbox label="해시" disabled onChange={onChange} />)
    await userEvent.click(screen.getByText('해시'))
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('RadioGroup', () => {
  const options = [
    { value: 'PYTHON', label: 'Python' },
    { value: 'CPP', label: 'C++', description: 'GCC 13' },
  ] as const

  it('묶음 제목(legend)으로 이름이 붙고, 고르면 값을 올린다', async () => {
    const onChange = vi.fn()
    render(
      <RadioGroup
        label="언어"
        name="lang"
        options={[...options]}
        value="PYTHON"
        onChange={onChange}
      />,
    )
    expect(screen.getByRole('group', { name: '언어' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Python' })).toBeChecked()
    // 설명(GCC 13)은 이름에 섞이지 않고 설명으로 읽힌다 (#257 리뷰)
    expect(screen.getByRole('radio', { name: 'C++' })).toHaveAccessibleDescription('GCC 13')
    await userEvent.click(screen.getByRole('radio', { name: 'C++' }))
    expect(onChange).toHaveBeenCalledWith('CPP')
  })

  it('card 변형도 같은 라디오다', () => {
    render(
      <RadioGroup
        label="난이도"
        name="level"
        variant="card"
        options={[...options]}
        value="CPP"
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('radio', { name: 'C++' })).toBeChecked()
  })

  it('Radio 하나만 써도 같은 name끼리 하나만 켜진다', async () => {
    render(
      <fieldset>
        <legend>언어</legend>
        <Radio name="x" value="a" label="A" defaultChecked />
        <Radio name="x" value="b" label="B" />
      </fieldset>,
    )
    await userEvent.click(screen.getByText('B'))
    expect(screen.getByRole('radio', { name: 'B' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'A' })).not.toBeChecked()
  })
})

describe('Switch', () => {
  it('스크린 리더에 스위치로 읽히고 켜고 끈다', async () => {
    const onChange = vi.fn()
    render(<Switch label="움직임 줄이기" onChange={(e) => onChange(e.target.checked)} />)
    const toggle = screen.getByRole('switch', { name: '움직임 줄이기' })
    await userEvent.click(toggle)
    expect(toggle).toBeChecked()
    expect(onChange).toHaveBeenLastCalledWith(true)
  })
})

describe('Tabs', () => {
  it('pill 변형도 탭 역할을 지키고 패널을 바꾼다', async () => {
    render(
      <Tabs defaultValue="all">
        <TabsList variant="pill" aria-label="필터">
          <TabsTrigger value="all">전체</TabsTrigger>
          <TabsTrigger value="wrong">틀린 문제</TabsTrigger>
        </TabsList>
        <TabsContent value="all">전체 목록</TabsContent>
        <TabsContent value="wrong">틀린 목록</TabsContent>
      </Tabs>,
    )
    expect(screen.getByRole('tablist', { name: '필터' })).toHaveAttribute('data-variant', 'pill')
    await userEvent.click(screen.getByRole('tab', { name: '틀린 문제' }))
    expect(screen.getByRole('tab', { name: '틀린 문제' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('틀린 목록')).toBeInTheDocument()
  })

  it('pill 탭의 포커스는 알약 둥글기를 바꾸지 않는다 (#257 리뷰)', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList variant="pill">
          <TabsTrigger value="a">가</TabsTrigger>
        </TabsList>
      </Tabs>,
    )
    expect(screen.getByRole('tab', { name: '가' })).not.toHaveClass('focus-visible:rounded-sm')
  })

  it('포커스 외곽선을 지우지 않는다 (#255 리뷰와 같은 함정)', () => {
    render(
      <Tabs defaultValue="a">
        <TabsList>
          <TabsTrigger value="a">가</TabsTrigger>
        </TabsList>
      </Tabs>,
    )
    const tab = screen.getByRole('tab', { name: '가' })
    expect(tab).toHaveClass('outline-hidden', 'focus-visible:outline-solid')
    expect(tab).not.toHaveClass('outline-none')
  })
})
