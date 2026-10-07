import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useAuth } from './useAuth'

describe('useAuth', () => {
  // #18에서 로그인 방식이 정해지기 전까지는 비로그인으로 고정한다.
  it('비로그인 상태를 돌려준다', () => {
    const { result } = renderHook(() => useAuth())

    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.user).toBeNull()
    expect(result.current.isLoading).toBe(false)
  })
})
