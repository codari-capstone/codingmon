import { expect, test } from '@playwright/test'

import { login } from './login.js'

test.describe('제출 결과 화면', () => {
  /**
   * 제출부터 판정까지 한 번에 본다 (SOLVE-09 → RES-01·02·07).
   *
   * 폴링은 e2e만 제대로 잴 수 있다 — 단위 테스트는 목을 직접 세워 상태를 하나씩 보여
   * 주지만, 실제로 간격을 두고 스스로 나아가는지는 브라우저에서만 드러난다.
   */
  test('코드를 제출하면 채점이 진행되고 판정이 뜬다', async ({ page }) => {
    await login(page)
    await page.goto('/problems/1')

    const editor = page.getByRole('textbox', { name: '코드 편집기' })
    await editor.click()
    await page.keyboard.type('print(1)')
    await page.getByRole('button', { name: '제출하기' }).click()

    await expect(page).toHaveURL(/\/submissions\/\d+$/)
    // 중간 상태를 잡지 않는다. 목은 조회마다 한 걸음 나아가므로 QUEUED는 다음 폴링까지
    // 1초만 남고, 워커가 붐비면 Playwright가 그 구간을 놓쳐 이따금 실패한다 — 단위
    // 테스트에서 같은 이유로 중간 상태 단언을 뺀 것과 같다.
    //
    // 아무도 밀지 않아도 판정까지 나아간다는 것이 여기서 볼 것이다.
    await expect(page.getByText('맞았습니다!!')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/^제출 #\d+$/)).toBeVisible()
    await expect(page.getByText('Python')).toBeVisible()

    // 정답이면 다음 문제(아직 열 곳이 없어 비활성)와 AI 리뷰 패널이다 (RES-07, AI-05).
    await expect(page.getByRole('button', { name: '다음 문제 (준비 중)' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'AI 리뷰' })).toBeEnabled()
  })

  /** 시작 코드를 그대로 내면 목이 오답을 준다(handlers.ts) — 오답 쪽 버튼을 본다. */
  test('오답이면 다시 풀기로 그 문제로 돌아간다', async ({ page }) => {
    await login(page)
    await page.goto('/problems/1')
    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toBeVisible()

    await page.getByRole('button', { name: '제출하기' }).click()
    await expect(page.getByText('틀렸습니다')).toBeVisible({ timeout: 15_000 })

    // [AI 분석]은 결과 옆 AI 패널의 버튼이다(#41). 오답이라 누를 수 있다.
    await expect(page.getByRole('button', { name: 'AI 분석' })).toBeEnabled()
    await page.getByRole('link', { name: '다시 풀기' }).click()

    // 제출한 언어가 주소에 담겨 온다.
    await expect(page).toHaveURL(/\/problems\/1\?language=PYTHON$/)
    // 이 테스트는 시작 코드를 그대로 냈으므로 여기 보이는 것도 시작 코드다 — 저장된 코드가
    // 복원됐다는 증거가 아니다. 그쪽은 solve.spec.ts의 '새로고침해도 쓰던 코드가 남아
    // 있다'가 본다.
    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toContainText('sys.stdin')
  })

  /**
   * 제출한 언어로 돌아오는지 (리뷰 지적).
   *
   * 풀이 화면은 고른 것이 없으면 첫 언어(PYTHON)를 연다. 결과 화면이 언어를 넘기지
   * 않으면, C++로 제출해 틀린 사람이 저장해 둔 C++ 코드가 아니라 Python 자리를 본다.
   * Python으로만 왕복하는 테스트는 이 경우를 지나친다.
   */
  test('C++로 제출한 뒤 다시 풀기를 누르면 C++로 돌아온다', async ({ page }) => {
    await login(page)
    await page.goto('/problems/1')
    // 언어는 주소에 담긴다. check()는 누른 직후 상태를 보는데 그 사이 리렌더가 끼어 어긋난다.
    await page.getByRole('radio', { name: 'C++' }).click()
    await expect(page.getByRole('radio', { name: 'C++' })).toBeChecked()
    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toContainText(
      'ios::sync_with_stdio',
    )

    // 시작 코드를 그대로 내면 목이 오답을 준다 (handlers.ts).
    await page.getByRole('button', { name: '제출하기' }).click()
    await expect(page.getByText('틀렸습니다')).toBeVisible({ timeout: 15_000 })

    await page.getByRole('link', { name: '다시 풀기' }).click()

    await expect(page.getByRole('radio', { name: 'C++' })).toBeChecked()
    await expect(page.getByRole('textbox', { name: '코드 편집기' })).toContainText(
      'ios::sync_with_stdio',
    )
  })

  /**
   * AI 문장의 공백 없는 긴 토큰이 패널 밖으로 넘치지 않는지 (#191 리뷰).
   *
   * 목의 분석에 별 120개짜리 출력값이 들어 있다(handlers.ts). 좁으면 문서가 가로로 넘치고,
   * 넓으면 오른쪽 열 밖으로 삐져나온다 — 두 폭을 다 본다. 줄바꿈은 브라우저만 잴 수 있다.
   */
  for (const width of [390, 1280]) {
    test(`${width}px에서 AI 분석의 긴 토큰이 패널 밖으로 넘치지 않는다`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await login(page)
      // 지난 제출 23: 틀렸습니다 (fixtures/history.ts)
      await page.goto('/submissions/23')
      await page.getByRole('button', { name: 'AI 분석' }).click()
      await expect(page.getByText(/별 120개로 나옵니다/)).toBeVisible({ timeout: 10_000 })
      // 힌트도 모델이 만든 글이다. 1단계 힌트에도 긴 토큰이 있다(handlers.ts).
      await page.getByRole('button', { name: '1단계 관찰 보기' }).click()
      await expect(page.getByText(/한 줄이 길어집니다/)).toBeVisible()

      const sizes = await page.evaluate(() => {
        const panel = document.querySelector('section[aria-labelledby="analysis-heading"]')
        if (!panel) return null
        return {
          panelScroll: panel.scrollWidth,
          panelClient: panel.clientWidth,
          panelRight: panel.getBoundingClientRect().right,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        }
      })

      expect(sizes).not.toBeNull()
      expect(sizes!.documentWidth).toBeLessThanOrEqual(sizes!.viewportWidth + 1)
      expect(sizes!.panelScroll).toBeLessThanOrEqual(sizes!.panelClient + 1)
      expect(sizes!.panelRight).toBeLessThanOrEqual(sizes!.viewportWidth + 1)
    })
  }
})
