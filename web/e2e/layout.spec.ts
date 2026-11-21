import { expect, test, type Page } from '@playwright/test'

import { ADMIN, login } from './login.js'

test('상단 내비게이션이 보이고 공개 메뉴로 이동한다', async ({ page }) => {
  // 문제 목록이 아닌 곳에서 출발해야 클릭이 아무 일도 안 해도 통과하는 일이 없다.
  await page.goto('/login')
  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await expect(page.getByRole('banner').getByRole('link', { name: 'Codingmon' })).toBeVisible()

  await page
    .getByRole('navigation', { name: '주요 메뉴' })
    .getByRole('link', { name: '문제' })
    .click()
  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible()
  await expect(page).toHaveURL(/\/problems$/)
})

// 클릭 직후에는 URL이 먼저 /submissions가 되고, 로그인으로 밀려나는 건 라우트 청크와
// 세션 조회가 끝난 뒤다. 그 사이 URL만 보면 타이밍에 따라 통과하므로 로그인 폼이 뜬
// 정착 상태를 기다린다.
test('비로그인이 보호된 메뉴를 누르면 로그인 화면에 닿는다', async ({ page }) => {
  await page.goto('/problems')
  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible()

  // 바닥글에도 같은 메뉴가 있어(#335) 상단 바의 것을 누른다
  await page.getByRole('banner').getByRole('link', { name: '제출 기록' }).click()

  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { name: '제출 기록' })).toHaveCount(0)
})

// 헤더 링크가 404로 떨어지면 URL만 맞아서는 못 잡는다. 폼이 실제로 그려지는지 본다.
test('헤더의 로그인 링크가 로그인 폼이 있는 화면으로 간다', async ({ page }) => {
  await page.goto('/problems')

  await page.getByRole('banner').getByRole('link', { name: '로그인' }).click()

  await expect(page.getByRole('form', { name: '로그인' })).toBeVisible()
  await expect(page.getByLabel('이메일')).toBeVisible()
  await expect(page.getByLabel('비밀번호')).toBeVisible()
  await expect(page).toHaveURL(/\/login$/)
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

/**
 * 번들 로드 전 깜빡임 (index.html의 인라인 스크립트).
 *
 * ThemeProvider의 useLayoutEffect는 React가 렌더를 시작한 뒤만 덮는다. main.tsx가
 * App을 동적 import하는 동안에는 아무 JS도 테마를 정하지 않으므로, 그 구간을
 * index.html의 인라인 스크립트가 맡는다. 앱 번들을 막아 그 구간을 고정시켜 검사한다.
 */
test('앱 번들이 오지 않아도 저장된 다크 테마가 적용된다', async ({ page }) => {
  await page.goto('/problems')
  await page.getByRole('button', { name: '다크 모드로 전환' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)

  await page.route('**/assets/*.js', (route) => route.abort())
  await page.reload()

  // 번들이 실제로 막혔는지부터 확인한다. 막히지 않았다면 이 테스트는 아무것도 증명하지 않는다
  await expect(page.getByRole('banner')).toHaveCount(0)
  await expect(page.locator('html')).toHaveClass(/dark/)
})

/**
 * 글꼴 CDN이 응답하지 않아도 화면이 뜨는지.
 *
 * 글꼴 CSS를 일반 stylesheet로 두면 렌더 차단 자원이 되어, cdn.jsdelivr.net이
 * 막힌 사내망이나 CI에서 응답을 기다리는 동안 첫 페인트가 밀린다. abort가 아니라
 * "응답하지 않는" 상태를 만들어야 이 차이가 드러난다 — abort는 즉시 실패해
 * 차단이든 아니든 빨리 끝난다.
 */
test('글꼴 CDN이 응답하지 않아도 화면이 뜬다', async ({ page }) => {
  await page.route('**cdn.jsdelivr.net/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 15_000))
    await route.abort()
  })

  // load를 기다리면 위 15초를 그대로 기다리게 된다
  await page.goto('/problems', { waitUntil: 'commit' })

  await expect(page.getByRole('heading', { name: '문제 목록' })).toBeVisible({ timeout: 8_000 })
})

test('권한 없음 화면이 뜬다', async ({ page }) => {
  await page.goto('/forbidden')

  await expect(page.getByText('403')).toBeVisible()
  await expect(page.getByRole('heading', { name: '이 화면을 볼 권한이 없어요' })).toBeVisible()
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
async function expectHeaderFits(page: Page, linkCount: number) {
  // 바닥글의 contact@codingmon.tech도 이름에 'codingmon'이 들어가 상단 바 안에서 찾는다(#335)
  await expect(page.getByRole('banner').getByRole('link', { name: 'Codingmon' })).toBeVisible()

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
  expect(measured!.count).toBe(linkCount)
  expect(measured!.clipped, 'nav 내용이 보이는 영역보다 넓다').toBe(false)
  expect(measured!.outside, '보이는 영역 밖으로 밀려난 메뉴가 있다').toEqual([])

  // 가로 스크롤이 생기면 반응형이 깨진 것이다
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflows, '문서에 가로 스크롤이 생겼다').toBe(false)

  // 높이 고정과 flex-wrap이 함께 있으면 내용이 박스 밖으로 넘친다.
  // boundingBox()는 레이아웃 박스만 돌려줘 넘친 콘텐츠를 보지 못한다.
  const headerOverflows = await page.evaluate(() => {
    const el = document.querySelector('header > div')
    if (!el) return null
    return el.scrollHeight > el.clientHeight
  })
  expect(headerOverflows, 'header가 세로로 넘쳤다').toBe(false)
}

for (const width of [320, 390, 430, 768]) {
  test(`${width}px에서 메뉴 네 개가 모두 보인다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/problems')

    await expectHeaderFits(page, 4)
  })
}

/**
 * 좁은 화면에서 버튼 묶음이 로고 줄에 남는지 (#341, #348 리뷰).
 *
 * 로고 줄이 넘치면 버튼 묶음이 따로 한 줄로 내려가 상단 바가 세 줄이 된다. 그러면 세션을 확인하는 동안과
 * 확인한 뒤의 줄 수가 달라 본문이 흔들린다. 불러오는 동안 로고 줄에는 w-20(80px) 자리표시만 있어
 * 확인한 뒤의 묶음(비로그인: 테마·로그인, 학습자: 칩·아바타)보다 좁다. 그래서 확인한 뒤가 한 줄이면 불러오는 동안도 한 줄이다.
 * 로고·칩·버튼 폭이 몇 px만 늘어도 320px에서 넘치므로 여기서 지킨다.
 */
async function expectActionsOnLogoRow(page: Page) {
  const rows = await page.evaluate(() => {
    const row = document.querySelector('header > div')
    const logo = row?.querySelector(':scope > a')
    const actions = row?.querySelector(':scope > div')
    if (!logo || !actions) return null
    return { logo: logo.getBoundingClientRect().top, actions: actions.getBoundingClientRect().top }
  })
  expect(rows, 'header의 로고나 버튼 묶음을 찾지 못했다 — 셀렉터가 깨졌다').not.toBeNull()
  expect(Math.abs(rows!.actions - rows!.logo), '버튼 묶음이 로고 줄 밖으로 내려갔다').toBeLessThan(
    20,
  )
}

test('320px 비로그인에서 버튼 묶음이 로고 줄에 남는다', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/problems')
  await expect(page.getByRole('banner').getByRole('link', { name: '로그인' })).toBeVisible()

  await expectActionsOnLogoRow(page)
})

test('320px 로그인 학습자에서 버튼 묶음이 로고 줄에 남는다', async ({ page }) => {
  await login(page)
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/problems')
  await expect(page.getByRole('button', { name: /사용자 메뉴/ })).toBeVisible()

  await expectActionsOnLogoRow(page)
})

// ADMIN은 학습자 화면에서 '관리자'까지 5개라 가장 넓다 (#264 리뷰, #331에서 요금제 추가)
for (const width of [320, 390]) {
  test(`${width}px에서 ADMIN의 메뉴 다섯 개가 모두 보인다`, async ({ page }) => {
    await login(page, ADMIN)
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/problems')
    // 새로고침 직후에는 세션을 몰라 '관리자'가 없다. 붙은 뒤에 잰다
    await expect(page.getByRole('banner').getByRole('link', { name: '관리자' })).toBeVisible()

    await expectHeaderFits(page, 5)
  })
}

/**
 * 360px에서 화면마다 문서에 가로 스크롤이 생기지 않는지 (#341).
 * 표·탭처럼 일부러 가로로 미는 상자는 그 안에서만 밀리므로 문서 폭에는 잡히지 않는다.
 * #341 점검에서 31개 화면을 잰 방식이다. 마이페이지 가로 탭이 격자 열을 넓혀 본문이 넘친 회귀를 여기서 잡는다.
 */
const NARROW = 360
const PUBLIC_PAGES = [
  '/',
  '/problems',
  '/pricing',
  '/terms',
  '/login',
  '/signup',
  '/password-reset',
]
const USER_PAGES = [
  '/problems/1',
  '/welcome',
  '/submissions',
  '/submissions/23',
  '/me',
  '/me/account',
  '/me/display',
  '/me/report',
  '/me/badges',
]
const ADMIN_PAGES = [
  '/admin/dashboard',
  // 관리자 문제 목록은 /admin 자체다(router.tsx). /admin/problems는 404 화면이다(#349 리뷰)
  '/admin',
  '/admin/problems/1',
  '/admin/members',
  '/admin/members/1',
  '/admin/reports',
  '/admin/tags',
]

async function expectNoPageScroll(page: Page, paths: string[]) {
  for (const path of paths) {
    await page.goto(path)
    // 불러오기가 끝난 뒤에 잰다. 풀이·제출 결과는 불러오는 동안에도 h1을 그려 h1만 기다리면 로딩 화면을 잰다(#349 리뷰)
    await expect(page.locator('h1').first()).toBeVisible()
    await expect(page.locator('[data-slot="loading-state"], [data-slot="skeleton"]')).toHaveCount(0)
    // 404·403·오류 화면과 로그인으로 튕긴 화면을 재지 않게 한다. 모두 h1을 그려 위 대기를 통과한다(#349 리뷰)
    await expect(
      page.locator('[data-slot="exception-page"], [data-slot="error-state"]'),
    ).toHaveCount(0)
    expect(new URL(page.url()).pathname, `${path}에서 다른 화면으로 옮겨졌다`).toBe(path)
    // Pretendard는 화면에 쓰인 글자 조각을 나중에 받는다. 바뀐 글꼴 폭으로 재야 한다(#349 리뷰)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    // 고정값 360이 아니라 clientWidth와 잰다. 세로 스크롤바가 보이는 환경(--headed)에서도 같은 기준이 된다(#349 리뷰)
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect.soft(scrollWidth, `${path}에 가로 스크롤이 생겼다`).toBeLessThanOrEqual(clientWidth)
  }
}

test(`${NARROW}px 공개 화면에 가로 스크롤이 없다`, async ({ page }) => {
  await page.setViewportSize({ width: NARROW, height: 800 })
  await expectNoPageScroll(page, PUBLIC_PAGES)
})

test(`${NARROW}px 학습자 화면에 가로 스크롤이 없다`, async ({ page }) => {
  await page.setViewportSize({ width: NARROW, height: 800 })
  await login(page)
  await expectNoPageScroll(page, USER_PAGES)
})

test(`${NARROW}px 관리자 화면에 가로 스크롤이 없다`, async ({ page }) => {
  await page.setViewportSize({ width: NARROW, height: 800 })
  await login(page, ADMIN)
  await expectNoPageScroll(page, ADMIN_PAGES)
})

// 오른쪽 탭으로 바로 들어와도 탭 줄이 그 탭까지 밀려 탭이 잘리지 않는다(MyNav).
// 링크를 누르면 Playwright가 먼저 그 링크로 밀어 주므로 주소로 바로 연다
test(`${NARROW}px 마이페이지 가로 탭에서 지금 탭이 다 보인다`, async ({ page }) => {
  await page.setViewportSize({ width: NARROW, height: 800 })
  await login(page)
  const nav = page.getByRole('navigation', { name: '마이페이지 메뉴' })
  for (const path of ['/me/display', '/me/withdraw']) {
    await page.goto(path)
    const active = nav.locator('[aria-current="page"]')
    await expect(active).toBeVisible()
    const navBox = (await nav.boundingBox())!
    const box = (await active.boundingBox())!
    expect(box.x, `${path} 탭 왼쪽이 잘렸다`).toBeGreaterThanOrEqual(navBox.x)
    expect(box.x + box.width, `${path} 탭 오른쪽이 잘렸다`).toBeLessThanOrEqual(
      navBox.x + navBox.width,
    )
  }
})
