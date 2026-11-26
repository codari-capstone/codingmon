import { expect, test, type Locator, type Page } from '@playwright/test'

import { ADMIN, login } from './login.js'

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
 * 분절형 탭의 알약(SlidingPill). 내 학습 탭·결제 주기·관리자 pill 탭이 함께 쓴다.
 * 알약이 움직이기 시작했는지(transitionrun)와 멈춘 자리가 지금 칸인지를 본다.
 * 내 학습 탭은 탭마다 다른 화면이라 탭 줄이 새로 그려지는데, 떠난 탭에서 지금 탭으로 미끄러져야 한다.
 */
async function watchPill(page: Page) {
  // 문서마다 다시 건다. 새로고침한 뒤에도 움직였는지 볼 수 있다
  await page.addInitScript(() => {
    const w = window as unknown as { pillSlid: boolean; pillCut: boolean }
    w.pillSlid = false
    w.pillCut = false
    const isPill = (event: TransitionEvent) =>
      (event.target as Element).matches('[data-slot="sliding-pill"]') &&
      event.propertyName === 'transform'
    document.addEventListener('transitionrun', (event) => {
      if (isPill(event)) w.pillSlid = true
    })
    // 시작한 뒤 바로 놓기로 끊겨도 transitionrun은 이미 났다. 끝까지 미끄러졌는지는 이것으로 본다(#379 리뷰)
    document.addEventListener('transitioncancel', (event) => {
      if (isPill(event)) w.pillCut = true
    })
  })
}

const cut = (page: Page) => page.evaluate(() => (window as unknown as { pillCut: boolean }).pillCut)

/**
 * 웹 글꼴이 다 올 때까지 기다린다. 미끄러지는 도중에 글꼴이 오면 칸 폭이 바뀌어 알약이 의도대로 바로 놓이고,
 * 그것이 끊김(pillCut)으로 잡힌다. 여러 테스트를 함께 돌려 느릴 때 그랬다
 */
const settled = (page: Page) => page.evaluate(async () => void (await document.fonts.ready))

/** 알약이 그 칸 위에 놓일 때까지 기다린다. 알약은 정수 offset으로 놓여 소수점 boundingBox와 1px 안쪽 차이가 난다(#378 리뷰) */
async function expectPillOn(row: Locator, item: Locator) {
  const pill = row.locator('[data-slot="sliding-pill"]')
  await expect
    .poll(async () => {
      const [a, b] = [await pill.boundingBox(), await item.boundingBox()]
      return a && b ? Math.max(Math.abs(a.x - b.x), Math.abs(a.width - b.width)) : Infinity
    })
    .toBeLessThanOrEqual(1)
}

async function switchLearnTab(page: Page) {
  await watchPill(page)
  await login(page)
  await page.goto('/me/report')
  const nav = page.getByRole('navigation', { name: '내 학습 메뉴' })
  await expect(nav.getByRole('link', { name: '학습 리포트' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await nav.getByRole('link', { name: '배지' }).click()
  const badges = nav.getByRole('link', { name: '배지' })
  await expect(badges).toHaveAttribute('aria-current', 'page')
  return { nav, badges }
}

const slid = (page: Page) =>
  page.evaluate(() => (window as unknown as { pillSlid: boolean }).pillSlid)

async function expectPillOnBadges(page: Page) {
  const nav = page.getByRole('navigation', { name: '내 학습 메뉴' })
  await expectPillOn(nav, nav.getByRole('link', { name: '배지' }))
}

test('내 학습 탭을 옮기면 알약이 지금 탭으로 미끄러진다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await switchLearnTab(page)
  await expect.poll(() => slid(page)).toBe(true)
  await expectPillOnBadges(page)
})

test('애니메이션 줄이기면 알약이 미끄러지지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await switchLearnTab(page)
  await page.waitForTimeout(500)
  expect(await slid(page)).toBe(false)
  // 움직이지 않은 것만 보면 알약이 안 보이거나 떠난 탭에 남는 회귀를 놓친다(#378 리뷰)
  await expectPillOnBadges(page)
  // 글자색도 바로 바뀐다(#379 리뷰)
  await expect(
    page.getByRole('navigation', { name: '내 학습 메뉴' }).getByRole('link', { name: '배지' }),
  ).toHaveCSS('transition-property', 'none')
})

test('애니메이션 줄이기면 결제 주기 알약과 글자색이 바로 바뀐다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/pricing')
  const group = page.getByRole('group', { name: '결제 주기' })
  await expect(group.locator('[data-slot="sliding-pill"]')).toHaveCSS('transition-property', 'none')
  // 알약만 바로 놓이고 글자색은 서서히 바뀌면 한 토글 안에서 어긋난다(#379 리뷰)
  for (const button of await group.getByRole('button').all())
    await expect(button).toHaveCSS('transition-property', 'none')
})

test('탭을 옮긴 뒤 새로고침하면 알약이 다시 미끄러지지 않는다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const { badges } = await switchLearnTab(page)
  await page.reload()
  await expect(badges).toHaveAttribute('aria-current', 'page')
  await page.waitForTimeout(500)
  expect(await slid(page)).toBe(false)
  await expectPillOnBadges(page)
})

test('글꼴이 와서 탭 폭이 바뀌면 알약이 미끄러지지 않고 바로 따라간다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await watchPill(page)
  await login(page)
  await page.goto('/me/badges')
  await expectPillOnBadges(page)

  // 웹 글꼴이 늦게 와서 앞 탭이 넓어진 것과 같다. [배지]가 오른쪽으로 밀린다(#378 리뷰)
  await page.evaluate(() => {
    ;(window as unknown as { pillSlid: boolean }).pillSlid = false
    document.querySelector<HTMLElement>('nav[aria-label="내 학습 메뉴"] a')!.style.paddingInline =
      '40px'
  })
  await expectPillOnBadges(page)
  expect(await slid(page)).toBe(false)
})

test('대소문자만 다른 주소에서도 알약이 지금 탭에 놓인다', async ({ page }) => {
  await login(page)
  await page.goto('/me/Badges')
  await expect(
    page.getByRole('navigation', { name: '내 학습 메뉴' }).getByRole('link', { name: '배지' }),
  ).toHaveAttribute('aria-current', 'page')
  await expectPillOnBadges(page)
})

test('결제 주기를 바꾸면 알약이 고른 칸으로 미끄러진다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await watchPill(page)
  await page.goto('/pricing')
  const group = page.getByRole('group', { name: '결제 주기' })
  await expectPillOn(group, group.getByRole('button', { name: '월간 결제' }))
  expect(await slid(page)).toBe(false) // 처음에는 제자리에 바로 놓는다
  await settled(page)

  const yearly = group.getByRole('button', { name: /연간 결제/ })
  await yearly.click()
  await expect(yearly).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => slid(page)).toBe(true)
  await expectPillOn(group, yearly)
  expect(await cut(page)).toBe(false)
})

test('관리자 pill 탭을 바꾸면 알약이 지금 탭으로 미끄러진다', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await watchPill(page)
  await login(page, ADMIN)
  await page.goto('/admin/members')
  const list = page.getByRole('tablist', { name: '회원 상태' })
  // 탭 옆 회원 수가 오면 칸 폭이 바뀐다. 온 뒤에 누른다
  await expectPillOn(list, list.getByRole('tab', { name: /전체 \d+/ }))
  await settled(page)

  const suspended = list.getByRole('tab', { name: /정지/ })
  await suspended.click()
  await expect(suspended).toHaveAttribute('aria-selected', 'true')
  await expect.poll(() => slid(page)).toBe(true)
  await expectPillOn(list, suspended)
  // 지금 탭만 굵은 글자라 고르면서 칸 폭이 바뀐다. 그래도 미끄러짐이 끊기지 않아야 한다
  expect(await cut(page)).toBe(false)
})
