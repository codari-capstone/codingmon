import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import { ADMIN_PAGE_SIZE } from './adminProblemQuery'

/** 회원 목록·상세가 모두 이 키 아래다. 정지·해제·탈퇴 뒤 이것 하나만 무효로 하면 탭 개수까지 새로 받는다 */
export const ADMIN_USERS_KEY = 'admin-users'

/** 회원 목록의 탭. 계약의 `status`에 '전체'(보내지 않음)를 더했다 */
export type AdminUserFilter = 'ALL' | 'ACTIVE' | 'SUSPENDED'

/** 관리자 회원 목록 (ADM-14). `page`는 1부터 센다(계약은 0부터라 보낼 때 1을 뺀다) */
export function adminUserListQuery(params: {
  filter: AdminUserFilter
  keyword: string
  page: number
}) {
  const query = {
    status: params.filter === 'ALL' ? undefined : params.filter,
    keyword: params.keyword || undefined,
    page: params.page - 1,
    size: ADMIN_PAGE_SIZE,
  }
  return queryOptions({
    queryKey: [ADMIN_USERS_KEY, 'list', query] as const,
    queryFn: async () => {
      const result = await api.GET('/api/admin/users', { params: { query } })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}
