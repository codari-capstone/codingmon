import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { LearningStats } from '@/api/types'

/**
 * 개념별 학습 통계 (REP-01·02). 서버가 요청할 때마다 다시 계산하므로(계약) 매번 새로 받는다.
 * 제출하고 돌아왔는데 30초 동안 옛 수치가 보이면 방금 푼 문제가 반영되지 않은 것처럼 보인다.
 *
 * 사용자별 응답이라 키가 `adoptSession`의 제거 대상에 들어 있어야 한다(session.ts).
 */
export function learningStatsQuery() {
  return queryOptions({
    queryKey: ['learning-stats'] as const,
    queryFn: async (): Promise<LearningStats> => {
      const result = await api.GET('/api/users/me/learning-stats')
      if (result.data === undefined) fail(result)
      return result.data
    },
    staleTime: 0,
  })
}
