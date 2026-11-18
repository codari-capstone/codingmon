import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import { ADMIN_PAGE_SIZE } from './adminProblemQuery'

/** 회원 목록·상세가 모두 이 키 아래다. 정지·해제·탈퇴 뒤 이것 하나만 무효로 하면 탭 개수까지 새로 받는다 */
export const ADMIN_USERS_KEY = 'admin-users'

/** 강제 탈퇴는 정지하고 이만큼 지난 뒤에 할 수 있다(ADM-16) */
export const WITHDRAW_AFTER_MS = 24 * 3_600_000

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

/** 회원 상세 (ADM-15). 정지 상태·사유와 오늘 AI 사용량까지 */
export function adminUserQuery(id: number) {
  return queryOptions({
    queryKey: [ADMIN_USERS_KEY, 'detail', id] as const,
    queryFn: async () => {
      const result = await api.GET('/api/admin/users/{id}', { params: { path: { id } } })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/** 회원의 제출 목록 (ADM-15). 최신순, `page`는 1부터 센다 */
export function adminUserSubmissionsQuery(id: number, page: number) {
  const query = { page: page - 1, size: ADMIN_PAGE_SIZE }
  return queryOptions({
    queryKey: [ADMIN_USERS_KEY, 'detail', id, 'submissions', query] as const,
    queryFn: async () => {
      const result = await api.GET('/api/admin/users/{id}/submissions', {
        params: { path: { id }, query },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/** 회원이 맞힌 문제 (ADM-15). 페이지 없이 모두 온다 */
export function adminUserSolvedQuery(id: number) {
  return queryOptions({
    queryKey: [ADMIN_USERS_KEY, 'detail', id, 'solved'] as const,
    queryFn: async () => {
      const result = await api.GET('/api/admin/users/{id}/solved-problems', {
        params: { path: { id } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/** 회원 제출 하나의 코드와 결과 (ADM-15). 채점이 끝난 제출이라 바뀌지 않는다 */
export function adminSubmissionQuery(id: number) {
  return queryOptions({
    queryKey: ['admin-submission', id] as const,
    queryFn: async () => {
      const result = await api.GET('/api/admin/submissions/{id}', { params: { path: { id } } })
      if (result.data === undefined) fail(result)
      return result.data
    },
    staleTime: Infinity,
  })
}
