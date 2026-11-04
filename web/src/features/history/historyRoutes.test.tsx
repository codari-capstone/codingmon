import { matchRoutes } from 'react-router'
import { describe, expect, it } from 'vitest'

import { router } from '@/app/router'
import { problemSubmissionsPath } from './historyPath'

describe('제출 기록 주소', () => {
  it('링크가 만드는 주소를 라우터가 받는다', () => {
    const matches = matchRoutes(router.routes, problemSubmissionsPath(7))
    const leaf = matches?.at(-1)

    expect(leaf?.route.path).toBe('submissions/problems/:problemId')
    expect(leaf?.params.problemId).toBe('7')
  })

  it('제출 번호 주소와 겹치지 않는다', () => {
    const leaf = matchRoutes(router.routes, '/submissions/7')?.at(-1)
    expect(leaf?.route.path).toBe('submissions/:id')
  })
})
