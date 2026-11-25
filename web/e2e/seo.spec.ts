import { expect, test } from '@playwright/test'

/**
 * 검색·공유 미리보기 (#309). 빌드 결과에 아이콘·manifest·OG 이미지가 실제로 실려 나가는지,
 * 화면별 head가 바뀌는지 본다. 화면별 규칙 자체는 src/app/PageHead.test.tsx가 본다.
 */
test('아이콘·manifest·OG 이미지가 응답한다', async ({ request }) => {
  for (const path of [
    '/favicon.ico',
    '/apple-touch-icon.png',
    '/icon-192.png',
    '/icon-512.png',
    '/og.png',
  ]) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    // SPA 대체(index.html)가 200으로 대신 답한 것이 아닌지 본다
    expect(response.headers()['content-type'], path).not.toContain('text/html')
  }
  const manifest = await request.get('/site.webmanifest')
  expect(manifest.status()).toBe(200)
  const body = (await manifest.json()) as { icons: { src: string }[] }
  expect(body.icons.map((icon) => icon.src)).toEqual(['/icon-192.png', '/icon-512.png'])
})

test('공개 화면은 제목과 canonical, 로그인이 필요한 화면은 noindex', async ({ page }) => {
  await page.goto('/problems')
  await expect(page).toHaveTitle('문제 목록 | Codingmon')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://codingmon.tech/problems',
  )
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  // 설명 태그는 하나다. 화면이 새로 붙이지 않고 정적 태그를 고친다
  await expect(page.locator('meta[name="description"]')).toHaveCount(1)
  await expect(page.locator('title')).toHaveCount(1)

  // 로그인 화면으로 돌려보내져도 noindex가 아니라 로그인 화면의 head다
  await page.goto('/me')
  await expect(page).toHaveTitle('로그인 | Codingmon')
  // 주석대로 로그인 화면의 head인지 noindex·canonical까지 본다(#326 리뷰)
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    'https://codingmon.tech/login',
  )

  await page.goto('/없는-주소')
  await expect(page).toHaveTitle('페이지를 찾을 수 없어요 | Codingmon')
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
})

test('robots.txt가 사이트맵을 알리고, 사이트맵에는 검색에 내보내는 화면의 정식 주소만 있다', async ({
  page,
  request,
}) => {
  const robots = await request.get('/robots.txt')
  expect(robots.headers()['content-type']).toContain('text/plain')
  expect(await robots.text()).toContain('Sitemap: https://codingmon.tech/sitemap.xml')

  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.headers()['content-type']).toContain('xml')
  const locs = [...(await sitemap.text()).matchAll(/<loc>(.+?)<\/loc>/g)].map((m) => m[1])
  expect(locs).toContain('https://codingmon.tech/')

  // 사이트맵 주소가 화면의 canonical과 다르거나 noindex 화면이면 검색엔진이 사이트맵을 덜 믿는다.
  // 로그인이 필요한 화면은 로그인 화면으로 돌려보내져 canonical이 달라지므로 여기서 걸린다
  for (const loc of locs) {
    await page.goto(new URL(loc).pathname)
    await expect(page.locator('link[rel="canonical"]'), loc).toHaveAttribute('href', loc)
    await expect(page.locator('meta[name="robots"]'), loc).toHaveCount(0)
  }
})

test('JS 없이 받은 HTML에 네이버 서치어드바이저 소유 확인 메타가 있다', async ({ request }) => {
  // 서치어드바이저는 이 메타로 소유를 확인한다. 빠지면 확인이 풀린다
  const html = await (await request.get('/')).text()
  expect(html).toMatch(/<meta name="naver-site-verification" content="[0-9a-f]{40}"/)
})
