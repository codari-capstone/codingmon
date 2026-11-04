import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { ProblemHistory, ProblemHistoryPage, SubmissionSummaryPage } from '@/api/types'
import { PAGE_SIZE } from '@/features/problems/problemListParams'

/**
 * 문제별 기록 (HIST-01). `page`는 화면과 같은 1부터 센 번호이고, 서버로 보낼 때 0부터로 바꾼다
 * (계약: "0부터 센다"). 문제 목록(toQuery)과 같은 변환이다.
 */
export function problemHistoryListQuery(page: number) {
  return queryOptions({
    queryKey: ['problem-history', { page }] as const,
    queryFn: async (): Promise<ProblemHistoryPage> => {
      const result = await api.GET('/api/users/me/problem-history', {
        params: { query: { page: page - 1, size: PAGE_SIZE } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
    // 페이지를 넘길 때 표가 사라졌다 나타나지 않게 한다 (문제 목록과 같은 이유).
    placeholderData: keepPreviousData,
  })
}

/**
 * 문제 하나의 기록 (제출 목록 화면 위쪽).
 *
 * 404 `PROBLEM_HISTORY_NOT_FOUND`는 없는 문제·제출한 적 없는 문제·판정이 난 제출이 없는
 * 문제를 구분하지 않는다(계약). 다시 물어도 같은 답이라 재시도하지 않는다.
 */
export function problemHistoryQuery(problemId: number) {
  return queryOptions({
    queryKey: ['problem-history', 'one', problemId] as const,
    queryFn: async (): Promise<ProblemHistory> => {
      const result = await api.GET('/api/users/me/problem-history/{problemId}', {
        params: { path: { problemId } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
    retry: false,
  })
}

/** 한 문제의 제출 목록 (HIST-02). 채점이 끝난 제출만 온다. */
export function problemSubmissionsQuery(problemId: number, page: number) {
  return queryOptions({
    queryKey: ['submissions', { problemId, page }] as const,
    queryFn: async (): Promise<SubmissionSummaryPage> => {
      const result = await api.GET('/api/submissions', {
        params: { query: { problemId, page: page - 1, size: PAGE_SIZE } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
    placeholderData: keepPreviousData,
  })
}
