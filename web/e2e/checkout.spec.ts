import { expect, test } from '@playwright/test'

import { login } from './login.js'

test.describe('프로 구독 결제', () => {
  /**
   * 요금제에서 결제 화면을 거쳐 결제 결과까지 (PRICE-03 → PAY-01 → PAY-02).
   * 목 모드는 포트원 창 대신 가짜 빌링키를 쓰고(portone.ts) 카드 결제를 늘 성공으로 본다(handlers.ts).
   * 목의 구독은 페이지 메모리에 있어 다시 불러오면 사라진다 — 화면 안 링크로만 옮겨 다닌다.
   */
  test('연간을 골라 결제하면 프로가 되고, 요금제 버튼이 내 구독 보기로 바뀐다', async ({
    page,
  }) => {
    await login(page)
    await page.getByRole('navigation').getByRole('link', { name: '요금제' }).first().click()
    await page.getByRole('button', { name: /연간 결제/ }).click()
    await page.getByRole('link', { name: '프로 시작하기' }).click()

    await expect(page).toHaveURL(/\/checkout\?cycle=yearly$/)
    const pay = page.getByRole('button', { name: '카드 등록하고 99,000원 결제하기' })
    await expect(pay).toBeDisabled()
    await page.getByRole('checkbox', { name: /이용약관과 환불 정책/ }).check()
    await page.getByRole('checkbox', { name: /매년 99,000원이 자동결제/ }).check()
    await pay.click()

    await expect(page.getByRole('heading', { name: '프로 구독이 시작됐어요' })).toBeVisible()
    await expect(page.getByText('프로 연간 · 99,000원')).toBeVisible()

    await page.getByRole('navigation').getByRole('link', { name: '요금제' }).first().click()
    await expect(page.getByRole('link', { name: '내 구독 보기' })).toHaveAttribute(
      'href',
      '/me/subscription',
    )
  })

  /** 결제 뒤 마이페이지 구독에서 주기 바꾸기·바꾸기 취소·해지·해지 취소 (MY-06) */
  test('구독을 관리한다: 주기 바꾸기와 취소, 해지와 해지 취소', async ({ page }) => {
    await login(page)
    await page.getByRole('navigation').getByRole('link', { name: '요금제' }).first().click()
    await page.getByRole('link', { name: '프로 시작하기' }).click()
    await page.getByRole('checkbox', { name: /이용약관과 환불 정책/ }).check()
    await page.getByRole('checkbox', { name: /매월 9,900원이 자동결제/ }).check()
    await page.getByRole('button', { name: '카드 등록하고 9,900원 결제하기' }).click()
    await page.getByRole('link', { name: '내 구독 보기' }).click()

    const card = page.getByRole('region', { name: '지금 플랜' })
    await expect(card).toContainText('프로 월간')

    await card.getByRole('button', { name: '연간으로 바꾸기' }).click()
    const dialog = page.getByRole('dialog', { name: '연간으로 바꿀까요?' })
    await dialog.getByRole('checkbox', { name: /바뀐 금액의 자동결제에 동의/ }).check()
    await dialog.getByRole('button', { name: '연간으로 바꾸기' }).click()
    await expect(card).toContainText('다음 결제부터 연간')

    await card.getByRole('button', { name: '바꾸기 취소' }).click()
    await expect(card.getByRole('button', { name: '연간으로 바꾸기' })).toBeVisible()

    await card.getByRole('button', { name: '해지' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: '해지' }).click()
    await expect(card).toContainText('해지 예정')

    await card.getByRole('button', { name: '해지 취소' }).click()
    await expect(card).toContainText('진행 중')
  })
})
