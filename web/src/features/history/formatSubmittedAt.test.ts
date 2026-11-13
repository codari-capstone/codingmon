import { describe, expect, it } from 'vitest'

import { formatSubmittedAt } from './formatSubmittedAt'

describe('formatSubmittedAt', () => {
  const now = new Date(2026, 10, 13, 12)

  it('올해 제출은 연도 없이 적는다', () => {
    const text = formatSubmittedAt(new Date(2026, 10, 3, 22).toISOString(), now)
    expect(text).toContain('11월 3일')
    expect(text).not.toContain('2026')
  })

  it('지난해 제출은 연도를 붙인다', () => {
    expect(formatSubmittedAt(new Date(2025, 10, 3, 22).toISOString(), now)).toContain('2025년')
  })

  it('잘못된 날짜는 예외 없이 줄표로 둔다', () => {
    expect(formatSubmittedAt('not-a-date', now)).toBe('—')
  })
})
