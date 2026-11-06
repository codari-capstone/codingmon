import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { UserActivity } from '@/api/types'

/**
 * 풀이 요약·최근 1년 잔디 (MY-05). 제출하고 돌아오면 오늘 칸이 바로 늘어야 하므로 매번 새로
 * 받는다(학습 통계와 같은 이유).
 *
 * 사용자별 응답이라 키가 `adoptSession`의 제거 대상에 들어 있어야 한다(session.ts).
 */
export function activityQuery() {
  return queryOptions({
    queryKey: ['activity'] as const,
    queryFn: async (): Promise<UserActivity> => {
      const result = await api.GET('/api/users/me/activity')
      if (result.data === undefined) fail(result)
      return result.data
    },
    staleTime: 0,
  })
}
