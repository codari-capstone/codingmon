import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { Toast, ToastProvider, ToastViewport } from '@/components/ui/toast'
import { Tooltip } from '@/components/ui/tooltip'

function ModalHarness({ description }: { description?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>배지 보기</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="첫 정답!"
        description={description}
        footer={<Button onClick={() => setOpen(false)}>확인했어요</Button>}
      >
        본문
      </Modal>
    </>
  )
}

/** 버튼 둘이 같은 Modal을 연다. 본문에 autoFocus 입력칸이 있다 */
function AutoFocusHarness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>닉네임 바꾸기</Button>
      <Button onClick={() => setOpen(true)}>이름 바꾸기</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="새 이름">
        <input aria-label="새 이름" autoFocus />
      </Modal>
    </>
  )
}

describe('Modal', () => {
  /**
   * autoFocus 자식이 있으면 React가 커밋 때 먼저 포커스를 옮겨, Radix의 onOpenAutoFocus가 불리지 않는다.
   * 그러면 연 버튼을 기억하지 못하거나 지난번 것을 기억한다 (#258 리뷰).
   */
  it('본문에 autoFocus가 있어도 닫으면 이번에 연 버튼으로 돌아간다', async () => {
    const user = userEvent.setup()
    render(<AutoFocusHarness />)

    await user.click(screen.getByRole('button', { name: '닉네임 바꾸기' }))
    expect(screen.getByRole('textbox', { name: '새 이름' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '닉네임 바꾸기' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '이름 바꾸기' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: '이름 바꾸기' })).toHaveFocus()
  })

  it('제목·설명으로 이름과 설명이 붙고, X로 닫으면 연 버튼으로 포커스가 돌아간다', async () => {
    const user = userEvent.setup()
    render(<ModalHarness description="배지를 받았어요" />)

    await user.click(screen.getByRole('button', { name: '배지 보기' }))
    const dialog = screen.getByRole('dialog', { name: '첫 정답!' })
    expect(dialog).toHaveAccessibleDescription('배지를 받았어요')

    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '배지 보기' })).toHaveFocus()
  })

  it('닫기 버튼은 스크롤되는 본문 밖에 있어 내려도 사라지지 않는다 (#258 리뷰)', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)

    await user.click(screen.getByRole('button', { name: '배지 보기' }))
    expect(screen.getByText('본문').closest('.overflow-y-auto')).not.toBeNull()
    expect(screen.getByRole('button', { name: '닫기' }).closest('.overflow-y-auto')).toBeNull()
  })

  it('Esc로 닫힌다', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)

    await user.click(screen.getByRole('button', { name: '배지 보기' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('설명이 없으면 없는 id를 가리키지 않는다', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)

    await user.click(screen.getByRole('button', { name: '배지 보기' }))
    expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-describedby')
  })

  it('고대비에서도 면의 경계를 그린다 (#257 리뷰와 같은 함정)', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)

    await user.click(screen.getByRole('button', { name: '배지 보기' }))
    expect(screen.getByRole('dialog')).toHaveClass('forced-colors:border')
  })
})

describe('Toast', () => {
  function renderToast(onUndo = vi.fn()) {
    render(
      <ToastProvider>
        <Toast
          tone="success"
          title="저장했어요"
          description="지난 버전은 기록에 남아요"
          action={{ label: '되돌리기', onClick: onUndo }}
        />
        <ToastViewport />
      </ToastProvider>,
    )
    return onUndo
  }

  it('동작 버튼을 누르면 그 일을 하고 알림을 닫는다', async () => {
    const user = userEvent.setup()
    const onUndo = renderToast()

    expect(screen.getByText('지난 버전은 기록에 남아요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '되돌리기' }))
    expect(onUndo).toHaveBeenCalled()
    expect(screen.queryByText('저장했어요')).not.toBeInTheDocument()
  })

  it('닫기 버튼으로 사라진다', async () => {
    const user = userEvent.setup()
    renderToast()

    await user.click(screen.getByRole('button', { name: '알림 닫기' }))
    expect(screen.queryByText('저장했어요')).not.toBeInTheDocument()
  })
})

describe('Tooltip', () => {
  it('포커스하면 말풍선이 뜨고 감싼 버튼의 설명이 된다', async () => {
    const user = userEvent.setup()
    render(
      <Tooltip label="코드를 처음 상태로 되돌려요">
        <Button aria-label="초기화">↺</Button>
      </Tooltip>,
    )

    await user.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('코드를 처음 상태로 되돌려요')
    expect(screen.getByRole('button', { name: '초기화' })).toHaveAccessibleDescription(
      '코드를 처음 상태로 되돌려요',
    )
  })
})
