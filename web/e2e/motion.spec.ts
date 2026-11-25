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

/**
 * 내 학습 탭(LearnNav)의 알약. 탭마다 다른 화면이라 탭 줄이 새로 그려지는데, 떠난 탭에서 지금 탭으로 미끄러져야 한다.
 * 알약이 움직이기 시작했는지(transitionrun)와 멈춘 자리가 지금 탭인지를 본다.
 */
async function switchLearnTab(page: Page) {
  await login(page)
  await page.goto('/me/report')
  const nav = page.getByRole('navigation', { name: '내 학습 메뉴' })
  await expect(nav.getByRole('link', { name: '학습 리포트' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await page.evaluate(() => {
    const w = window as unknown as { pillSlid: boolean }
    w.pillSlid = false
    document.addEventListener('transitionrun', (event) => {
      const target = event.target as Element
      if (target.closest('nav[aria-label="내 학습 메뉴"]') && event.propertyName === 'transform')
        w.pillSlid = true
    })
  })
  await nav.getByRole('link', { name: '배지' }).click()
  const badges = nav.getByRole('link', { name: '배지' })
  await expect(badges).toHaveAttribute('aria-current', 'page')
  return { nav, badges }
}

const slid = (page: Page) =>
  page.evaluate(() => (window as unknown as { pillSlid: boolean }).pillSlid)

test('내 학습 탭을 옮기면 알약이 지금 탭으로 미끄러진다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const { nav, badges } = await switchLearnTab(page)
  await expect.poll(() => slid(page)).toBe(true)

  const pill = nav.locator('span[aria-hidden="true"]').first()
  await expect
    .poll(async () => {
      const [a, b] = [await pill.boundingBox(), await badges.boundingBox()]
      return a && b ? Math.round(Math.abs(a.x - b.x) + Math.abs(a.width - b.width)) : -1
    })
    .toBe(0)
})

test('애니메이션 줄이기면 알약이 미끄러지지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await switchLearnTab(page)
  await page.waitForTimeout(500)
  expect(await slid(page)).toBe(false)
})
