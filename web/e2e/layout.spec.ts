import { expect, test } from '@playwright/test'

test('상단 내비게이션이 보이고 메뉴로 이동한다', async ({ page }) => {
  await page.goto('/problems')

  await expect(page.getByRole('link', { name: 'Codari' })).toBeVisible()
  await page.getByRole('link', { name: '제출 기록' }).click()
  await expect(page).toHaveURL(/\/submissions$/)
})

test('테마를 바꾸면 새로고침해도 유지된다', async ({ page }) => {
  await page.goto('/problems')

  const html = page.locator('html')
  await expect(html).not.toHaveClass(/dark/)

  await page.getByRole('button', { name: '다크 모드로 전환' }).click()
  await expect(html).toHaveClass(/dark/)

  await page.reload()
  await expect(page.locator('html')).toHaveClass(/dark/)
})

test('권한 없음 화면이 뜬다', async ({ page }) => {
  await page.goto('/forbidden')

  await expect(page.getByText('403')).toBeVisible()
  await expect(page.getByRole('heading', { name: '권한이 없습니다' })).toBeVisible()
})

/**
 * 좁은 화면에서 메뉴가 잘리지 않는지 (UX-05).
 *
 * "링크가 보이는가"로는 이 회귀를 잡을 수 없다. nav에 min-w-0과 overflow-x-auto가
 * 붙어 있던 동안 320px에서 메뉴 세 개가 전부 화면 밖에 있었는데도
 * toBeVisible()과 문서 scrollWidth 검사는 모두 통과했다. 박스가 0이 아니고
 * overflow가 가로 스크롤을 흡수했기 때문이다. 그래서 링크의 실제 좌표를 nav의
 * 보이는 영역과 비교한다.
 */
for (const width of [320, 390, 430, 768]) {
  test(`${width}px에서 메뉴 세 개가 모두 보인다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/problems')

    await expect(page.getByRole('link', { name: 'Codari' })).toBeVisible()

    const measured = await page.evaluate(() => {
      const nav = document.querySelector('header nav')
      if (!nav) return null
      const navBox = nav.getBoundingClientRect()
      const links = Array.from(nav.querySelectorAll('a'))
      const outside = links
        .filter((a) => {
          const box = a.getBoundingClientRect()
          // 1px은 소수점 반올림 여유
          return box.right > navBox.right + 1 || box.left < navBox.left - 1
        })
        .map((a) => a.textContent?.trim())
      return { clipped: nav.scrollWidth > nav.clientWidth, outside, count: links.length }
    })

    expect(measured, 'header nav를 찾지 못했다 — 셀렉터가 깨졌다').not.toBeNull()
    expect(measured!.count).toBe(3)
    expect(measured!.clipped, 'nav 내용이 보이는 영역보다 넓다').toBe(false)
    expect(measured!.outside, '보이는 영역 밖으로 밀려난 메뉴가 있다').toEqual([])

    // 가로 스크롤이 생기면 반응형이 깨진 것이다
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    )
    expect(overflows, '문서에 가로 스크롤이 생겼다').toBe(false)

    // h-14(56px 고정)와 flex-wrap이 함께 있으면 내용이 박스 밖으로 넘친다.
    // boundingBox()는 레이아웃 박스만 돌려줘 넘친 콘텐츠를 보지 못한다.
    const headerOverflows = await page.evaluate(() => {
      const el = document.querySelector('header > div')
      if (!el) return null
      return el.scrollHeight > el.clientHeight
    })
    expect(headerOverflows, 'header가 세로로 넘쳤다').toBe(false)
  })
}

test('헤더의 로그인 버튼이 404로 떨어지지 않는다', async ({ page }) => {
  await page.goto('/problems')

  await page.getByRole('link', { name: '로그인' }).click()

  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: '로그인 준비 중입니다' })).toBeVisible()
  await expect(page.getByRole('link', { name: '문제 보러 가기' })).toBeVisible()
})
