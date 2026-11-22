import { describe, expect, it } from 'vitest'

import { addMonths } from '@/features/subscription/subscriptionQuery'
import { classifyFailure } from './outcome'
import { readBillingRedirect } from './portone'

describe('addMonths (PAY-01 다음 결제일)', () => {
  it('같은 날짜로 한 달·1년 뒤다', () => {
    expect(addMonths(new Date(2026, 10, 22), 1)).toEqual(new Date(2026, 11, 22))
    expect(addMonths(new Date(2026, 10, 22), 12)).toEqual(new Date(2027, 10, 22))
  })

  it('달의 끝을 넘지 않는다 — 1월 31일 + 1개월은 2월 28일', () => {
    expect(addMonths(new Date(2027, 0, 31), 1)).toEqual(new Date(2027, 1, 28))
  })
})

describe('classifyFailure (PAY-02)', () => {
  it.each([
    ['응답을 못 받음', new TypeError('Failed to fetch'), { kind: 'unknown' }],
    [
      '결제 전 연결 실패',
      { status: 503, code: 'PAYMENT_PROVIDER_UNAVAILABLE' },
      { kind: 'provider' },
    ],
    ['결과 모름', { status: 503, code: 'PAYMENT_UNAVAILABLE' }, { kind: 'unknown' }],
    ['게이트웨이 시간 초과', { status: 504 }, { kind: 'unknown' }],
    [
      '카드 결제 실패',
      { status: 402, code: 'PAYMENT_FAILED', detail: '카드 한도를 넘었어요' },
      { kind: 'failed', reason: '카드 한도를 넘었어요' },
    ],
    ['이유 없는 400', { status: 400 }, { kind: 'failed', reason: null }],
    ['이미 프로', { status: 409, code: 'SUBSCRIPTION_ALREADY_ACTIVE' }, 'already'],
    ['세션 끊김', { status: 401 }, 'signedOut'],
  ])('%s', (_name, error, expected) => {
    expect(classifyFailure(error)).toEqual(expected)
  })
})

describe('readBillingRedirect (모바일 카드 등록에서 돌아옴)', () => {
  const read = (query: string) => readBillingRedirect(new URLSearchParams(query))

  it('result=billing이 아니면 돌아온 것이 아니다', () => {
    expect(read('cycle=yearly&billingKey=b')).toBeNull()
  })

  it('빌링키를 읽는다', () => {
    expect(read('result=billing&billingKey=billing-1')).toEqual({ billingKey: 'billing-1' })
  })

  it('오류가 있으면 빌링키보다 오류다', () => {
    expect(read('result=billing&code=FAILURE_TYPE_PG&message=취소했어요&billingKey=b')).toEqual({
      code: 'FAILURE_TYPE_PG',
      message: '취소했어요',
    })
  })

  it('둘 다 없으면 등록하지 못한 것으로 본다', () => {
    expect(read('result=billing')).toMatchObject({ code: 'NO_BILLING_KEY' })
  })
})
