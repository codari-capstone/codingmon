import { describe, expect, it } from 'vitest'

import { readPollInterval } from './queryClient'

describe('readPollInterval', () => {
  it('숫자 문자열을 그대로 쓴다', () => {
    expect(readPollInterval('500')).toBe(500)
  })

  it('값이 없으면 기본값 1000을 쓴다', () => {
    expect(readPollInterval(undefined)).toBe(1000)
  })

  // Number('')는 0이라 refetchInterval에 넘기면 폴링이 돌지 않는다
  it('빈 문자열은 기본값으로 되돌린다', () => {
    expect(readPollInterval('')).toBe(1000)
  })

  // Number('abc')는 NaN
  it('숫자가 아니면 기본값으로 되돌린다', () => {
    expect(readPollInterval('abc')).toBe(1000)
  })

  it('0과 음수는 기본값으로 되돌린다', () => {
    expect(readPollInterval('0')).toBe(1000)
    expect(readPollInterval('-100')).toBe(1000)
  })
})
