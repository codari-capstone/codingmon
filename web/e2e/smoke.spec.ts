import { expect, test } from '@playwright/test'

/**
 * 빌드한 정적 파일이 Nginx와 같은 방식(preview 서버)으로 떠서
 * 라우팅이 동작하는지 확인한다. 시연 흐름 E2E는 담당 이슈에서 추가한다.
 */
test('루트 주소는 문제 목록으로 보낸다', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/problems$/)
  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible()
})

test('없는 주소는 404 화면을 보여 준다 (새로고침해도 404가 아니다)', async ({ page }) => {
  const response = await page.goto('/없는-주소')

  // Nginx try_files와 같은 동작: 실제 파일이 없어도 index.html을 돌려주고
  // 라우터가 404 화면을 고른다. HTTP 자체는 200이어야 한다.
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: '페이지를 찾을 수 없습니다' })).toBeVisible()
})
