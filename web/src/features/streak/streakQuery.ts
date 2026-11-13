import { queryOptions, useQuery } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { UserStreak } from '@/api/types'
import { useAuth } from '@/features/auth/useAuth'

/**
 * 연속 학습 (STREAK-01·02). 상단 바 칩은 화면을 옮겨도 마운트된 채라 staleTime 0만으로는
 * 다시 받지 않는다 — 제출이 접수되면 useSubmit이 이 키를 무효화한다.
 *
 * 사용자별 응답이라 키가 `adoptSession`의 제거 대상에 들어 있어야 한다(session.ts).
 */
export function streakQuery() {
  return queryOptions({
    queryKey: ['streak'] as const,
    queryFn: async (): Promise<UserStreak> => {
      const result = await api.GET('/api/users/me/streak')
      if (result.data === undefined) fail(result)
      return result.data
    },
    staleTime: 0,
  })
}

/**
 * 카드와 칩이 같이 쓴다. 비로그인은 부르지 않는다(계약) — `guest`면 0일째·빈 달력으로 그린다.
 * 로그인했는데 `data`가 없으면(불러오는 중·실패) 숫자를 모르는 것이지 0일이 아니다.
 */
export function useStreak() {
  const { isAuthenticated, isLoading } = useAuth()
  const { data } = useQuery({ ...streakQuery(), enabled: isAuthenticated })
  // enabled가 꺼져도 캐시는 남는다. 세션이 401로 끊기면 ['me']만 비워지므로 앞사람 달력을 버린다
  return { streak: isAuthenticated ? data : undefined, guest: !isLoading && !isAuthenticated }
}
