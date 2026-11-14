import { expect, test } from '@playwright/test'

import { ADMIN, login } from './login.js'

/**
 * 관리자 문제 관리 목록 (ADM-01).
 *
 * 단위 테스트가 상태 문구를 경우마다 재므로 여기서는 실제 브라우저에서만 드러나는 것을
 * 본다 — lazy 라우트가 /admin에서 실제로 받아지는지, 검색 디바운스가 진짜 시간으로
 * 도는지다.
 */
test('관리자 목록에 상태와 버전이 보이고 검색이 걸러진다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin')

  await expect(page.getByRole('heading', { level: 1, name: '문제 관리' })).toBeVisible()
  await expect(page.getByRole('row', { name: /두 수의 합/ })).toContainText('공개')

  // 공개 버전 위에 초안이 있는 문제. 응답에는 이 문구가 없고 화면이 두 값으로 만든다.
  await expect(page.getByRole('row', { name: /연습 문제 9/ })).toContainText('공개 v1 · 수정 중')

  await page.getByLabel('제목으로 검색').fill('두')

  await expect(page.getByText('조건에 맞는 문제 1개')).toBeVisible()
  await expect(page.getByRole('row')).toHaveCount(2) // 머리 1 + 1
})

/**
 * 문제 등록·수정 (ADM-02·03·07).
 *
 * 단위 테스트가 저장 분기와 문구를 경우마다 재므로, 여기서는 브라우저에서만 드러나는
 * 것을 본다 — 목록에서 폼까지 lazy 라우트가 이어지는지, 숨은 탭에 둔 값이 실제 제출에
 * 실려 가는지, Markdown 미리보기가 정말 그려지는지다.
 */
test('목록에서 문제를 열어 지문을 고치면 공개 중인 버전에 반영된다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin')

  await page.getByRole('link', { name: '두 수의 합' }).click()

  // 문제 제목이 화면 제목이다(#242)
  await expect(page.getByRole('heading', { level: 1, name: '두 수의 합' })).toBeVisible()
  await expect(page.getByLabel('제목')).toHaveValue('두 수의 합')

  await page.getByRole('tab', { name: '지문' }).click()
  await page.getByRole('textbox', { name: '지문' }).fill('# 고친 지문\n\n$O(n)$에 풀린다.')

  // 미리보기는 사용자 화면과 같은 컴포넌트다. KaTeX가 실제로 수식을 그리는지 본다.
  const preview = page.locator('.katex')
  await expect(preview.first()).toBeVisible()

  await page.getByRole('button', { name: '저장' }).click()

  await expect(page.getByRole('status')).toContainText('공개 중인 v1')
})

test('새 문제를 등록하면 초안으로 목록에 들어간다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin')

  await page.getByRole('link', { name: '새 문제' }).click()

  // 폼이 실제로 떴는지 먼저 본다. getByLabel은 부분 일치라 '제목'이 목록의
  // '제목으로 검색'에도 걸린다 — lazy 청크를 기다리지 않으면 목록이 아직 떠 있는 동안
  // 검색창에 제목을 넣고, 폼은 빈 제목으로 저장을 눌러 400이 된다.
  await expect(page.getByRole('checkbox').first()).toBeVisible()

  const title = page.getByLabel('제목')
  await title.fill('e2e로 만든 문제')
  await expect(title).toHaveValue('e2e로 만든 문제')
  await page.getByRole('button', { name: '저장' }).click()

  await expect(page.getByRole('status')).toContainText('만들었어요')
  await expect(page).toHaveURL(/\/admin\/problems\/\d+$/)

  // 목록으로 돌아오면 초안으로 보인다. 목 상태가 요청 사이에 남아 있다는 뜻이기도 하다.
  await page.getByRole('link', { name: '문제 관리로' }).click()
  await page.getByLabel('제목으로 검색').fill('e2e로')
  await expect(page.getByRole('row', { name: /e2e로 만든 문제/ })).toContainText('작성 중')
})

/**
 * 화면 제목이 문제 제목이라(#242) 관리자가 쓴 값이 그대로 h1이 된다. 공백 없는 긴 영문을
 * 줄이지 못하면 320px에서 문서 전체가 가로로 넘친다(#288 리뷰). jsdom은 폭을 재지 않아 여기서 본다.
 */
test('공백 없는 긴 제목도 좁은 화면에서 가로로 넘치지 않는다', async ({ page }) => {
  await login(page, ADMIN)
  await page.goto('/admin/problems/10')
  await page.getByLabel('제목').fill('LongestSubstringWithoutRepeatingCharacters')
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'LongestSubstringWithoutRepeatingCharacters',
  )

  await page.setViewportSize({ width: 320, height: 800 })
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBeLessThanOrEqual(1)
})

/**
 * 나란한 칸(출처·라이선스, 입력·출력 형식·제약 조건)은 도움말이나 오류가 한 칸에만 있어도 입력칸이
 * 같은 줄에 서야 한다. 바닥 맞춤은 오류 문구까지 바닥에 넣어 26px 어긋났다(#289 리뷰). 폭은 jsdom이 재지 않는다.
 */
test('나란한 칸은 한 칸에만 오류·도움말이 있어도 입력칸이 같은 줄에 선다', async ({ page }) => {
  await login(page, ADMIN)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/admin/problems/1')
  // 두 칸의 위치를 한 번에 잰다. 따로 재면 그 사이 미리보기(수식)가 그려지며 화면이 밀려 1px씩 어긋나게 읽혔다.
  // 그려지는 중일 수 있어 자리 잡을 때까지 기다린다 — 정말 어긋나 있으면 끝내 실패한다
  const offset = (a: string, b: string) =>
    page.evaluate(
      ([x, y]) =>
        Math.abs(
          document.getElementById(x!)!.getBoundingClientRect().top -
            document.getElementById(y!)!.getBoundingClientRect().top,
        ),
      [a, b],
    )

  // 나란히 놓이지 않은 칸의 라벨은 왼쪽에 그대로 있다(맞춤을 격자일 때만 건다)
  const labelX = (await page.locator('label[for="title"]').boundingBox())!.x
  expect(Math.abs(labelX - (await page.locator('#title').boundingBox())!.x)).toBeLessThan(1)

  // 오류가 없으면 나란한 줄 아래 간격도 다른 칸 사이와 같다(빈 오류 줄이 6px을 남기지 않는다)
  const box = async (selector: string) => (await page.locator(selector).boundingBox())!
  const below = async (input: string, next: string) => {
    const a = await box(input)
    return (await box(next)).y - (a.y + a.height)
  }
  const usual = await below('#title', 'fieldset[data-slot="radio-group"]')
  expect(Math.abs((await below('#sourceName', 'label[for="sourceUrl"]')) - usual)).toBeLessThan(1)

  await page.getByLabel('라이선스').fill('가'.repeat(121))
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page.getByText(/120자/)).toBeVisible()
  await expect.poll(() => offset('sourceName', 'license')).toBeLessThan(1)

  await page.getByRole('tab', { name: '지문' }).click()
  await page.locator('#constraintsMarkdown').waitFor()
  await expect.poll(() => offset('inputDescription', 'constraintsMarkdown')).toBeLessThan(1)
})
