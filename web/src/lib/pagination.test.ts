import { describe, expect, it } from 'vitest'

import { pageItems } from './pagination'

describe('pageItems', () => {
  it('페이지가 적으면 모두 보여 준다', () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3])
  })

  // 문제가 늘면 페이지도 늘어난다. 전부 그리면 좁은 화면에서 줄이 넘친다.
  it('멀리 떨어진 번호는 접는다', () => {
    expect(pageItems(10, 20)).toEqual([1, null, 9, 10, 11, null, 20])
  })

  it('양 끝은 늘 남긴다', () => {
    expect(pageItems(1, 20)).toEqual([1, 2, null, 20])
    expect(pageItems(20, 20)).toEqual([1, null, 19, 20])
  })

  // 끝에서 둘째라 1 하나만 끊긴다. 번호 하나를 '…'로 바꾸면 누를 것이 줄어든다.
  it('한 칸만 끊기면 접지 않는다', () => {
    expect(pageItems(2, 4)).toEqual([1, 2, 3, 4])
  })
})
