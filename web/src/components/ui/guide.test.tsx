import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Accordion } from '@/components/ui/accordion'
import { CodeBlock } from '@/components/ui/code-block'
import { HintBox } from '@/components/ui/hint-box'
import { Stepper } from '@/components/ui/stepper'

afterEach(() => vi.unstubAllGlobals())

describe('HintBox', () => {
  it('단계·제목·본문을 보여 주고 tone을 입힌다', () => {
    render(
      <HintBox step="힌트 1 · 관찰" title="입력 크기를 보세요" tone="neutral">
        <p>본문</p>
      </HintBox>,
    )

    expect(screen.getByText('힌트 1 · 관찰')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '입력 크기를 보세요' })).toBeInTheDocument()
    expect(screen.getByText('본문').closest('section')).toHaveClass('bg-muted')
  })
})

describe('Stepper', () => {
  it('current 앞은 완료, 현재는 aria-current=step, 뒤는 남은 단계다', () => {
    render(
      <Stepper
        current={1}
        steps={[{ label: '관찰' }, { label: '방향', description: '다음' }, { label: '원리' }]}
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(items.map((i) => i.getAttribute('data-state'))).toEqual(['done', 'current', 'todo'])
    expect(items[1]).toHaveAttribute('aria-current', 'step')
    expect(items[0]).not.toHaveAttribute('aria-current')
  })

  // 고대비에서는 배경·그림자가 지워져 현재 단계가 남은 단계와 같아 보인다 (#261 리뷰)
  it('고대비에서도 원은 테두리로, 현재 단계는 바깥 띠로 구분된다', () => {
    const { container } = render(
      <Stepper current={1} steps={[{ label: '관찰' }, { label: '방향' }, { label: '원리' }]} />,
    )

    const dots = container.querySelectorAll('[data-step-dot]')
    dots.forEach((d) => expect(d).toHaveClass('forced-colors:border'))
    expect(dots[1]).toHaveClass('forced-colors:outline-2')
    expect(dots[2]).not.toHaveClass('forced-colors:outline-2')
  })
})

describe('Accordion', () => {
  const items = [
    { value: 'a', title: '첫째', content: '첫째 내용' },
    { value: 'b', title: '둘째', content: '둘째 내용' },
  ]

  it('defaultOpen을 열어 두고 하나를 열면 다른 것은 닫힌다', async () => {
    render(<Accordion items={items} defaultOpen={['a']} />)

    expect(screen.getByRole('button', { name: '첫째' })).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(screen.getByRole('button', { name: '둘째' }))
    expect(screen.getByRole('button', { name: '둘째' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: '첫째' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('multiple이면 여러 개가 함께 열린다', async () => {
    render(<Accordion items={items} multiple defaultOpen={['a']} />)

    await userEvent.click(screen.getByRole('button', { name: '둘째' }))
    expect(screen.getByRole('button', { name: '첫째' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('button', { name: '둘째' })).toHaveAttribute('aria-expanded', 'true')
  })

  // 하나만 여는 모드에 값을 둘 넘기면 하나가 조용히 버려진다. 타입에서 막는다 (#261 리뷰)
  it('multiple 없이 defaultOpen에 값을 둘 넘기면 타입 오류다', () => {
    // @ts-expect-error 하나만 여는 모드는 defaultOpen을 하나까지만 받는다
    const twoOpen = <Accordion items={items} defaultOpen={['a', 'b']} />
    const multi = <Accordion items={items} multiple defaultOpen={['a', 'b']} />
    expect([twoOpen, multi]).toHaveLength(2)
  })
})

describe('CodeBlock', () => {
  it('줄 번호와 강조 줄을 그리고 번호는 낭독기에서 숨긴다', () => {
    const { container } = render(<CodeBlock code={'a\nb\nc'} lineNumbers highlight={[2]} />)

    const lines = container.querySelectorAll('code > span')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toHaveClass('bg-inverse-raised')
    expect(lines[0]).not.toHaveClass('bg-inverse-raised')
    expect(lines[0].querySelector('[aria-hidden="true"]')).toHaveTextContent('1')
  })

  // 줄 번호 없이 강조만 넘겨도 강조가 조용히 빠지지 않아야 한다 (#261 리뷰)
  it('줄 번호 없이 highlight만 줘도 그 줄을 강조하고 번호는 그리지 않는다', () => {
    const { container } = render(<CodeBlock code={'a\nb\nc'} highlight={[3]} />)

    const lines = container.querySelectorAll('code > span')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toHaveAttribute('data-highlighted', 'true')
    expect(lines[2]).toHaveClass('forced-colors:border-l-4')
    expect(lines[0].querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it('끝 개행은 빈 줄로 세지 않고, 복사할 때는 원문 그대로 쓴다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const { container } = render(<CodeBlock code={'print(1)\n'} lineNumbers />)

    expect(container.querySelectorAll('code > span')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: '복사' }))
    expect(writeText).toHaveBeenCalledWith('print(1)\n')
  })

  it('가운데 빈 줄은 그대로 센다', () => {
    const { container } = render(<CodeBlock code={'a\n\nb'} lineNumbers />)
    expect(container.querySelectorAll('code > span')).toHaveLength(3)
  })

  // 한 화면에 블록이 여럿이면 '복사, 복사'로만 읽힌다. 머리글자를 이름에 붙인다 (#261 리뷰)
  it('복사를 누르면 코드를 클립보드에 쓰고, 버튼 이름에 머리글자가 붙는다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CodeBlock code="print(1)" language="python" />)

    await userEvent.click(screen.getByRole('button', { name: 'python 복사' }))

    expect(writeText).toHaveBeenCalledWith('print(1)')
    expect(await screen.findByRole('button', { name: 'python 복사됨' })).toBeInTheDocument()
  })

  // 가로로 스크롤한 곳에서도 강조 줄 배경이 끊기지 않게, code가 가장 긴 줄까지 늘어난다 (#261 리뷰)
  it('code는 가장 긴 줄 너비로 늘어나 줄 배경이 스크롤 영역 끝까지 간다', () => {
    const { container } = render(<CodeBlock code={'a'.repeat(300)} highlight={[1]} />)

    expect(container.querySelector('code')).toHaveClass('inline-block', 'min-w-full')
  })

  it('클립보드를 못 쓰면 복사됨으로 바꾸지 않는다', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    })
    render(<CodeBlock code="x" />)

    await userEvent.click(screen.getByRole('button', { name: '복사' }))

    expect(screen.getByRole('button', { name: '복사' })).toBeInTheDocument()
  })

  it('copyable={false}에 머리글자도 없으면 머리줄이 없다', () => {
    const { container } = render(<CodeBlock code="x" copyable={false} />)
    expect(container.querySelector('figcaption')).toBeNull()
  })
})
