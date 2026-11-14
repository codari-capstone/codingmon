import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import type { CurrentUser } from '@/api/types'
import { SUBMIT_MUTATION_KEY } from '@/features/solve/submitQuery'
import { ME_QUERY_KEY } from './authQuery'
import { adoptSession } from './session'

const USER: CurrentUser = {
  id: 2,
  nickname: '새사용자',
  role: 'USER',
  email: 'ne***@codari.test',
  loginMethod: 'EMAIL',
  githubUsername: null,
}

describe('adoptSession', () => {
  // 본인 것만 오는 응답이다. 지우지 않으면 다른 사람이 로그인해도 이전 사람의 것이 남는다.
  it.each([
    ['problems', ['problems', { page: 0 }]],
    ['submission', ['submission', 5]],
    ['problem-history', ['problem-history', { page: 1 }]],
    ['problem-history (문제 하나)', ['problem-history', 'one', 3]],
    ['submissions', ['submissions', { problemId: 3, page: 1 }]],
    ['learning-stats', ['learning-stats']],
    ['activity', ['activity']],
    ['ai-quota', ['ai-quota']],
    ['code-review', ['code-review', 11]],
    ['badges', ['badges']],
  ])('이전 사용자의 %s 캐시를 지운다', async (_name, key) => {
    const client = new QueryClient()
    client.setQueryData(key, { owner: 'A' })

    await adoptSession(client, USER)

    expect(client.getQueryData(key)).toBeUndefined()
    expect(client.getQueryData(ME_QUERY_KEY)).toEqual(USER)
  })

  // 축하 창(BadgeCelebrator)이 지켜보는 제출 기록은 지우고, 로그인 같은 다른 mutation은 남긴다
  it('이전 사용자의 제출 기록만 지운다', async () => {
    const client = new QueryClient()
    const mutations = client.getMutationCache()
    await mutations
      .build(client, { mutationKey: SUBMIT_MUTATION_KEY, mutationFn: async () => 5 })
      .execute(undefined)
    await mutations
      .build(client, { mutationKey: ['login'], mutationFn: async () => 'ok' })
      .execute(undefined)

    await adoptSession(client, USER)

    expect(mutations.findAll({ mutationKey: SUBMIT_MUTATION_KEY })).toHaveLength(0)
    expect(mutations.findAll({ mutationKey: ['login'] })).toHaveLength(1)
  })
})
