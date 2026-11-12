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

  it('복사를 누르면 코드를 클립보드에 쓰고 복사됨으로 바뀐다', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CodeBlock code="print(1)" language="python" />)

    await userEvent.click(screen.getByRole('button', { name: '복사' }))

    expect(writeText).toHaveBeenCalledWith('print(1)')
    expect(await screen.findByRole('button', { name: '복사됨' })).toBeInTheDocument()
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
