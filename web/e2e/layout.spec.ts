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

test('모바일 폭에서도 내비게이션이 보인다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/problems')

  await expect(page.getByRole('link', { name: 'Codari' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible()

  // 가로 스크롤이 생기면 반응형이 깨진 것이다
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows).toBe(false)
})
