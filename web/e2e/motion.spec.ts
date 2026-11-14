import { expect, test, type Page } from '@playwright/test'

import { login } from './login.js'

/**
 * 애니메이션 줄이기 (UX-08). index.css의 motion-reduce 변형이 화면 설정(<html data-motion>)과
 * 기기 설정을 함께 보는지 실제 CSS로 확인한다. jsdom은 CSS를 계산하지 않아 단위 테스트로는 못 본다.
 *
 * 잴 대상: 화면 설정의 스위치 트랙. `transition-colors ... motion-reduce:transition-none`이다.
 */
async function trackTransition(page: Page) {
  return page
    .getByRole('switch', { name: '줄 번호 보기' })
    .evaluate((input) => getComputedStyle(input.nextElementSibling!).transitionProperty)
}

async function openDisplay(page: Page) {
  await login(page)
  await page.goto('/me/display')
  await expect(page.getByRole('switch', { name: /애니메이션 줄이기/ })).toBeVisible()
}

test('고른 적이 없으면 기기 설정을 따른다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openDisplay(page)
  await expect(page.getByRole('switch', { name: /애니메이션 줄이기/ })).toBeChecked()
  expect(await trackTransition(page)).toBe('none')
})

test('켜면 기기가 움직임을 허용해도 줄이고, 새로고침해도 남는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openDisplay(page)
  expect(await trackTransition(page)).not.toBe('none')

  await page.getByRole('switch', { name: /애니메이션 줄이기/ }).check({ force: true })
  expect(await trackTransition(page)).toBe('none')

  await page.reload()
  await expect(page.getByRole('switch', { name: /애니메이션 줄이기/ })).toBeChecked()
  expect(await trackTransition(page)).toBe('none')
})

test('다른 탭에서 켜면 화면 설정을 열지 않은 탭에도 바로 적용된다', async ({ page, context }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await openDisplay(page)
  const other = await context.newPage()
  await other.goto('/problems')
  await expect(other.getByRole('heading', { name: '문제 목록' })).toBeVisible()

  await page.getByRole('switch', { name: /애니메이션 줄이기/ }).check({ force: true })
  await expect(other.locator('html')).toHaveAttribute('data-motion', 'reduce')
})

test('[기기 설정 따르기]를 누르면 다시 기기 설정을 따른다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openDisplay(page)
  await page.getByRole('switch', { name: /애니메이션 줄이기/ }).uncheck({ force: true })
  expect(await trackTransition(page)).not.toBe('none')

  await page.getByRole('button', { name: '기기 설정 따르기' }).click()
  await expect(page.locator('html')).not.toHaveAttribute('data-motion')
  expect(await trackTransition(page)).toBe('none')
})

test('끄면 기기가 동작 줄이기여도 움직임을 그대로 둔다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openDisplay(page)
  await page.getByRole('switch', { name: /애니메이션 줄이기/ }).uncheck({ force: true })
  expect(await trackTransition(page)).not.toBe('none')
})
