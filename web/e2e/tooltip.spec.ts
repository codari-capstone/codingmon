import { expect, test, type Page } from '@playwright/test'

import { login } from './login.js'

/**
 * AI 리뷰의 복잡도 "?" 설명. 터치의 이벤트 순서와 '누르는 중'(:active)은 jsdom이 흉내 내지 못해
 * 브라우저에서 본다.
 */
async function openReview(page: Page) {
  await login(page)
  // 지난 제출 11: 맞았습니다 (fixtures/history.ts)
  await page.goto('/submissions/11')
  await page.getByRole('button', { name: 'AI 리뷰' }).click()
  await expect(page.getByText('리뷰 완료')).toBeVisible({ timeout: 10_000 })
}

/** 닫혔다가 곧바로 다시 열리는 깜빡임을 놓치지 않게, 닫힘 애니메이션이 끝날 시간을 두고 센다 */
async function expectTooltips(page: Page, count: number) {
  await page.waitForTimeout(500)
  await expect(page.getByRole('tooltip')).toHaveCount(count)
}

test.describe('터치', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })

  test('"?"는 누를 때마다 열리고 닫힌다', async ({ page }) => {
    await openReview(page)
    const button = page.getByRole('button', { name: '시간 설명' })

    for (const count of [1, 0, 1]) {
      await button.tap()
      await expectTooltips(page, count)
    }
  })
})

test('hover로 열리기를 기다리는 사이에 눌러도 열린 채로 남는다', async ({ page }) => {
  await openReview(page)

  await page.getByRole('button', { name: '공간 설명' }).hover()
  await page.mouse.down()
  // hover 지연(300ms)보다 오래 누른다
  await page.waitForTimeout(450)
  await page.mouse.up()

  await expectTooltips(page, 1)
})

test('키보드 포커스로는 열리고, 눌러서 생긴 포커스로는 열리지 않는다', async ({ page }) => {
  await openReview(page)
  const button = page.getByRole('button', { name: '시간 설명' })

  await button.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expectTooltips(page, 1)

  await page.keyboard.press('Escape')
  // 닫히는 중인 말풍선이 남은 채 누르지 않게 다 닫힌 것을 본다
  await expectTooltips(page, 0)
  await button.blur()
  // 누른 채 벗어나면 click이 없다. 포커스만 생기고 설명은 열리지 않아야 한다
  const box = (await button.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(5, 5, { steps: 10 })
  await page.mouse.up()
  await expect(button).toBeFocused()
  await expectTooltips(page, 0)
})
