import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '@/mocks/server'
import { api } from './client'

/**
 * baseUrl이 '/' 같은 상대 경로면 openapi-fetch가 만드는 new Request()가
 * Node에서 "Failed to parse URL from /api/..."로 실패한다. 이 테스트가
 * 그 회귀를 막는다.
 */
describe('api 클라이언트', () => {
  it('jsdom 환경에서 MSW 핸들러까지 요청이 닿는다', async () => {
    server.use(
      http.get(`${window.location.origin}/api/problems`, () =>
        HttpResponse.json({ content: [], totalElements: 0 }),
      ),
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (api as any).GET('/api/problems')

    expect(error).toBeUndefined()
    expect(data).toEqual({ content: [], totalElements: 0 })
  })
})
