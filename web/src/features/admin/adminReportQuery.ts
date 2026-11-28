import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { ReportStatus } from '@/api/types'
import { ADMIN_PAGE_SIZE } from './adminProblemQuery'
import { UNRESOLVED_REPORT_STATUSES } from './labels'

/** 신고 목록·상세·수가 모두 이 키 아래다. 저장하면 이것 하나만 무효로 해 메뉴 숫자와 탭 건수까지 새로 받는다 */
export const ADMIN_REPORTS_KEY = 'admin-reports'

/**
 * 관리자 신고 목록 (ADM-13). `statuses`가 비면 전체다.
 * `page`는 1부터 센다(계약은 0부터라 보낼 때 1을 뺀다). 개수만 볼 때는 `size` 1로 부른다(계약).
 */
export function adminReportListQuery(statuses: ReportStatus[], page = 1, size = ADMIN_PAGE_SIZE) {
  const query = { status: statuses, page: page - 1, size }
  return queryOptions({
    queryKey: [ADMIN_REPORTS_KEY, 'list', query] as const,
    queryFn: async () => {
      const result = await api.GET('/api/admin/reports', { params: { query } })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}

/** 처리 안 한 신고 수 (ADM-10 메뉴, ADM-13 목록 머리). 같은 키라 둘이 한 번만 받는다 */
export function unresolvedReportCountQuery() {
  return queryOptions({
    ...adminReportListQuery(UNRESOLVED_REPORT_STATUSES, 1, 1),
    select: (data) => data.totalElements,
  })
}

/** 관리자 신고 상세 (ADM-13) */
export function adminReportQuery(id: number) {
  return queryOptions({
    queryKey: [ADMIN_REPORTS_KEY, 'detail', id] as const,
    queryFn: async () => {
      const result = await api.GET('/api/admin/reports/{id}', { params: { path: { id } } })
      if (result.data === undefined) fail(result)
      return result.data
    },
  })
}
