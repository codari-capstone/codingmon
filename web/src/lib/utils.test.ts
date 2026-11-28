import { describe, expect, it } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('프로젝트 글자 크기가 앞의 글자색을 지우지 않는다', () => {
    expect(cn('text-foreground', 'text-title-1')).toBe('text-foreground text-title-1')
  })

  it('뒤의 글자색이 앞의 프로젝트 글자 크기를 지우지 않는다', () => {
    expect(cn('text-body-sm', 'text-muted-foreground')).toBe('text-body-sm text-muted-foreground')
  })

  it('글자 크기끼리는 뒤의 것이 이긴다', () => {
    expect(cn('text-foreground text-sm', 'text-title-2')).toBe('text-foreground text-title-2')
    expect(cn('text-caption', 'text-2xl')).toBe('text-2xl')
  })
})
