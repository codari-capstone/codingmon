import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { BadgeCode, UserBadge } from '@/api/types'

/**
 * 내 배지 12개 (BADGE-01). 배지 화면과 축하 창(BadgeCelebrator)이 같이 쓴다.
 * 채점이 끝날 때마다 받은 배지가 바뀔 수 있어 늘 새로 받는다.
 *
 * 사용자별 응답이라 키가 `adoptSession`의 제거 대상에 들어 있어야 한다(session.ts).
 */
export function badgesQuery() {
  return queryOptions({
    queryKey: ['badges'] as const,
    queryFn: fetchMyBadges,
    staleTime: 0,
  })
}

/** 캐시를 거치지 않는 조회. 축하 창은 진행 중인 요청을 함께 쓰면 안 돼서 이걸 직접 부른다(BadgeCelebrator). */
export async function fetchMyBadges(): Promise<UserBadge[]> {
  const result = await api.GET('/api/users/me/badges')
  if (result.data === undefined) fail(result)
  return result.data.badges
}

/** 축하 창을 띄운 배지를 알린다 (BADGE-03). 이미 축하한 배지도 204라 두 탭에서 불러도 괜찮다(계약). */
export async function markCelebrated(code: BadgeCode): Promise<void> {
  const result = await api.POST('/api/users/me/badges/{code}/celebrated', {
    params: { path: { code } },
  })
  if (result.error !== undefined) fail(result)
}
