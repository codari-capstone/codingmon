import * as PortOne from '@portone/browser-sdk/v2'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { requestBillingKey } from './portone'

vi.mock('@portone/browser-sdk/v2', () => ({ requestIssueBillingKey: vi.fn() }))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('requestBillingKey (PAY-01)', () => {
  // SDK 예외의 원문은 영문 기술 문구다. 경고 상자에 그대로 뜨지 않게 한다(#356 리뷰)
  it('SDK가 던지면 원문 대신 정해 둔 문구를 돌려준다', async () => {
    vi.stubEnv('VITE_PORTONE_STORE_ID', 'store-test')
    vi.stubEnv('VITE_PORTONE_CHANNEL_KEY', 'channel-test')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(PortOne.requestIssueBillingKey).mockRejectedValue(
      new Error('Failed to fetch dynamically imported module'),
    )

    expect(await requestBillingKey('cus-1')).toEqual({
      code: 'SDK_ERROR',
      message: '카드를 등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    })
  })
})
