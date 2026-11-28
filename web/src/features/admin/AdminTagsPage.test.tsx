import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, describe, expect, it } from 'vitest'

import type { ConceptTag } from '@/api/types'
import { createQueryClient } from '@/app/queryClient'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { conceptTags } from '@/mocks/fixtures/problems'
import { resetConceptTags } from '@/mocks/handlers'
import { server } from '@/mocks/server'
import { Component as AdminTagsPage } from './AdminTagsPage'

// 목에서 등록한 태그는 모듈 상태다. 테스트끼리 넘어가지 않게 비운다
afterEach(() => resetConceptTags())

function renderPage() {
  const client = createQueryClient()
  client.setQueryData(ME_QUERY_KEY, { id: 2, nickname: '관리자', role: 'ADMIN' })
  const router = createMemoryRouter([{ path: '/admin/tags', Component: AdminTagsPage }], {
    initialEntries: ['/admin/tags'],
  })
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return client
}

const form = () => screen.getByRole('form', { name: '새 태그 등록' })

describe('AdminTagsPage (ADM-11)', () => {
  it('태그를 이름과 영문 이름(slug)으로 보인다', async () => {
    renderPage()

    const list = await screen.findByRole('region', { name: '태그 목록' })
    const rows = (await within(list).findAllByRole('row')).slice(1)
    expect(rows).toHaveLength(conceptTags.length)
    expect(rows[0]).toHaveTextContent(`${conceptTags[0].name}${conceptTags[0].slug}`)
    expect(screen.getByRole('heading', { level: 1, name: '태그' })).toBeInTheDocument()
  })

  it('서버와 같은 규칙으로 화면에서 먼저 막는다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('region', { name: '태그 목록' })

    await user.type(within(form()).getByLabelText('이름'), '   ')
    await user.type(within(form()).getByLabelText('영문 이름 (slug)'), 'Binary_Search')
    await user.click(within(form()).getByRole('button', { name: '등록' }))

    // 공백뿐인 이름은 비었다고 본다(서버가 앞뒤 공백을 지운다)
    expect(await within(form()).findByText('이름을 입력해 주세요')).toBeInTheDocument()
    expect(within(form()).getByText(/영문 소문자·숫자를 - 로 이어 주세요/)).toBeInTheDocument()
  })

  it('이름은 100자, 영문 이름은 80자까지다', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('region', { name: '태그 목록' })

    await user.type(within(form()).getByLabelText('이름'), '가'.repeat(101))
    await user.type(within(form()).getByLabelText('영문 이름 (slug)'), 'a'.repeat(81))
    await user.click(within(form()).getByRole('button', { name: '등록' }))

    expect(await within(form()).findByText('이름은 100자까지예요')).toBeInTheDocument()
    expect(within(form()).getByText('영문 이름은 80자까지예요')).toBeInTheDocument()
  })

  it('태그가 하나도 없으면 등록 폼의 자리를 말하지 않고 안내한다', async () => {
    // 좁은 폭에서는 폼이 목록 아래로 내려가 '오른쪽'이 맞지 않는다(#313 리뷰)
    server.use(http.get('*/api/concept-tags', () => HttpResponse.json([])))
    renderPage()
    expect(await screen.findByText('아직 태그가 없어요')).toBeInTheDocument()
    expect(screen.getByText('새 태그 등록에서 첫 태그를 등록해 주세요.')).toBeInTheDocument()
  })

  // slug 앞뒤 공백은 떼고 보낸다. 복사해 붙인 보이지 않는 공백으로 막히지 않는다(#313 리뷰)
  it('등록하면 목록에 바로 붙어 방금 등록 표시가 되고, 문제 작성 화면이 읽는 캐시에도 들어가며 폼을 비운다', async () => {
    const user = userEvent.setup()
    const client = renderPage()
    await screen.findByRole('region', { name: '태그 목록' })

    await user.type(within(form()).getByLabelText('이름'), '  이분 탐색 ')
    await user.type(within(form()).getByLabelText('영문 이름 (slug)'), ' binary-search ')
    await user.click(within(form()).getByRole('button', { name: '등록' }))

    const row = (await screen.findByText('binary-search')).closest('tr')!
    // 이름은 앞뒤 공백을 지운 값이다(계약)
    expect(within(row).getByText('이분 탐색')).toBeInTheDocument()
    expect(within(row).getByText('방금 등록')).toBeInTheDocument()
    expect(
      client.getQueryData<ConceptTag[]>(['concept-tags'])?.some((t) => t.slug === 'binary-search'),
    ).toBe(true)
    await waitFor(() => expect(within(form()).getByLabelText('이름')).toHaveValue(''))
    expect(within(form()).getByLabelText('영문 이름 (slug)')).toHaveValue('')
  })

  it('같은 이름이나 영문 이름이 있으면 서버 문구를 그대로 보인다 (CONCEPT_TAG_EXISTS)', async () => {
    const user = userEvent.setup()
    renderPage()
    await screen.findByRole('region', { name: '태그 목록' })

    await user.type(within(form()).getByLabelText('이름'), conceptTags[0].name)
    await user.type(within(form()).getByLabelText('영문 이름 (slug)'), 'brand-new')
    await user.click(within(form()).getByRole('button', { name: '등록' }))

    expect(await within(form()).findByRole('alert')).toHaveTextContent(
      '같은 이름이나 같은 영문 이름의 태그가 이미 있어요. 다른 이름을 입력해 주세요 (CONCEPT_TAG_EXISTS)',
    )
    // 입력은 그대로 남아 고쳐서 다시 보낼 수 있다
    expect(within(form()).getByLabelText('영문 이름 (slug)')).toHaveValue('brand-new')

    // 값을 고치면 지난 중복 오류를 거둔다. 남기면 새 값도 중복처럼 보인다(코드 리뷰)
    await user.type(within(form()).getByLabelText('이름'), '2')
    expect(within(form()).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('이름이 붙은 랜드마크는 등록 폼 하나다', async () => {
    // 상자와 폼에 같은 이름을 주면 '새 태그 등록'이 두 번 읽힌다(코드 리뷰)
    renderPage()
    await screen.findByRole('region', { name: '태그 목록' })
    expect(screen.queryByRole('region', { name: '새 태그 등록' })).not.toBeInTheDocument()
    expect(form()).toBeInTheDocument()
  })
})
