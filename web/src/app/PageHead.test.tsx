import { render, waitFor } from '@testing-library/react'
// 정적 HTML을 글자 그대로 읽는다(Vite ?raw)
import indexHtml from '../../index.html?raw'
import { Outlet, createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'

import type { PageHandle } from './AppShell'
import { DEFAULT_DESCRIPTION, DEFAULT_TITLE, PageHead, SITE_URL } from './PageHead'

function Layout() {
  return (
    <>
      <PageHead />
      <Outlet />
    </>
  )
}

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        Component: Layout,
        children: [
          { index: true, element: <p>홈</p> },
          {
            path: 'problems',
            element: <p>목록</p>,
            handle: { title: '문제 목록', description: '문제 목록 설명' } satisfies PageHandle,
          },
          {
            handle: { noindex: true } satisfies PageHandle,
            children: [
              {
                path: 'me',
                element: <p>마이</p>,
                handle: { title: '마이페이지' } satisfies PageHandle,
              },
            ],
          },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const robots = () => document.head.querySelector('meta[name="robots"]')
const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
const description = () =>
  document.head.querySelector('meta[name="description"]')?.getAttribute('content')

beforeEach(() => {
  // index.html의 정적 제목·설명 태그를 흉내 낸다. PageHead는 새로 붙이지 않고 이 태그를 고친다
  document.head.querySelectorAll('title, meta[name="description"]').forEach((el) => el.remove())
  const title = document.createElement('title')
  title.textContent = DEFAULT_TITLE
  const meta = document.createElement('meta')
  meta.name = 'description'
  meta.content = DEFAULT_DESCRIPTION
  document.head.append(title, meta)
})

describe('PageHead (#309)', () => {
  it('제목이 없는 화면은 사이트 기본 제목·설명이고 canonical을 단다', async () => {
    renderAt('/')
    await waitFor(() => expect(document.title).toBe(DEFAULT_TITLE))
    expect(description()).toBe(DEFAULT_DESCRIPTION)
    expect(canonical()).toBe(`${SITE_URL}/`)
    expect(robots()).toBeNull()
  })

  it('화면의 제목·설명을 쓰고 canonical에 쿼리를 붙이지 않는다', async () => {
    renderAt('/problems?difficulty=EASY')
    await waitFor(() => expect(document.title).toBe('문제 목록 | Codingmon'))
    expect(description()).toBe('문제 목록 설명')
    // 정적 태그를 고칠 뿐 하나 더 붙이지 않는다(#326 리뷰)
    expect(document.head.querySelectorAll('title')).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(canonical()).toBe(`${SITE_URL}/problems`)
  })

  it('대소문자·끝 슬래시가 다른 주소도 canonical은 하나다', async () => {
    // 라우터는 /Problems/도 같은 화면으로 연다. 변형마다 스스로를 정식이라 하지 않는다(#326 리뷰)
    renderAt('/Problems/')
    await waitFor(() => expect(document.title).toBe('문제 목록 | Codingmon'))
    expect(canonical()).toBe(`${SITE_URL}/problems`)
  })

  it('상위 라우트의 noindex를 아래 화면이 받고, canonical은 달지 않는다', async () => {
    renderAt('/me')
    await waitFor(() => expect(document.title).toBe('마이페이지 | Codingmon'))
    expect(robots()).toHaveAttribute('content', 'noindex')
    expect(canonical()).toBeUndefined()
  })

  it('화면을 옮기면 제목·설명·noindex가 따라 바뀐다', async () => {
    const router = renderAt('/me')
    await waitFor(() => expect(robots()).not.toBeNull())

    await router.navigate('/problems')
    await waitFor(() => expect(document.title).toBe('문제 목록 | Codingmon'))
    expect(robots()).toBeNull()
    expect(description()).toBe('문제 목록 설명')

    await router.navigate('/')
    await waitFor(() => expect(description()).toBe(DEFAULT_DESCRIPTION))
  })

  it('index.html의 정적 제목·설명이 기본값과 같다 — 미리보기 봇은 JS를 돌리지 않는다', () => {
    expect(indexHtml).toContain(`<title>${DEFAULT_TITLE}</title>`)
    expect(indexHtml).toContain(`content="${DEFAULT_DESCRIPTION}"`)
    // 모든 주소에 같은 HTML이 나가므로 og:url을 박지 않는다. 박으면 공유가 모두 홈으로 간다(#326 리뷰)
    expect(indexHtml).not.toContain('property="og:url"')
  })
})
