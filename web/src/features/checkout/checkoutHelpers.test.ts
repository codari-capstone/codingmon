import { describe, expect, it } from 'vitest'

import { addMonthsKst, formatLongDate } from '@/features/subscription/subscriptionQuery'
import { classifyFailure } from './outcome'
import { readBillingRedirect } from './portone'

describe('addMonthsKst (PAY-01 다음 결제일)', () => {
  const next = (iso: string, months: number) => addMonthsKst(new Date(iso), months).toISOString()

  it('같은 시각으로 한 달·1년 뒤다', () => {
    expect(next('2026-11-22T03:00:00Z', 1)).toBe('2026-12-22T03:00:00.000Z')
    expect(next('2026-11-22T03:00:00Z', 12)).toBe('2027-11-22T03:00:00.000Z')
  })

  it('달의 끝을 넘지 않는다 — 1월 31일 + 1개월은 2월 28일', () => {
    expect(next('2027-01-31T03:00:00Z', 1)).toBe('2027-02-28T03:00:00.000Z')
  })

  // UTC로는 1월 30일 16시지만 한국은 1월 31일 01시다. 브라우저 시간대가 아니라 한국 날짜로 센다(#356 리뷰)
  it('한국 날짜로 센다', () => {
    expect(formatLongDate(addMonthsKst(new Date('2027-01-30T16:00:00Z'), 1))).toBe(
      '2027년 2월 28일',
    )
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
    // 결제한 뒤 반영하다 난 오류일 수 있다(#356 리뷰)
    ['서버 오류', { status: 500 }, { kind: 'unknown' }],
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

  // 주소의 message는 누구나 넣을 수 있어 보이지 않고 정해 둔 문구를 쓴다(#356 리뷰)
  it('오류가 있으면 빌링키보다 오류이고, 주소의 문구는 쓰지 않는다', () => {
    expect(read('result=billing&code=FAILURE_TYPE_PG&message=여기로연락&billingKey=b')).toEqual({
      code: 'FAILURE_TYPE_PG',
      message: '카드를 등록하지 못했어요. 잠시 뒤 다시 시도해 주세요.',
    })
  })

  it('둘 다 없으면 등록하지 못한 것으로 본다', () => {
    expect(read('result=billing')).toMatchObject({ code: 'NO_BILLING_KEY' })
  })
})
