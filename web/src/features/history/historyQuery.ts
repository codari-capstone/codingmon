import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { ProblemHistory, ProblemHistoryPage, SubmissionSummaryPage } from '@/api/types'
import { PAGE_SIZE } from '@/features/problems/problemListParams'

/**
 * 기록은 매번 새로 받는다. 전역 staleTime(30초)을 그대로 두면 제출하고 결과를 본 뒤 기록으로
 * 돌아와도 방금 낸 제출과 바뀐 맞힘 여부·시도 횟수가 보이지 않는다 — 채점이 끝나는 때가
 * 제출 때와 달라 제출 쪽에서 무효화할 자리도 마땅치 않다. 읽기 한 번이라 값이 싸다.
 * 캐시는 페이지를 넘길 때 placeholder로만 쓴다.
 *
 * 사용자별 응답이라 키가 `adoptSession`의 제거 대상에 들어 있어야 한다(session.ts).
 */
const ALWAYS_FRESH = 0

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
    staleTime: ALWAYS_FRESH,
    // 페이지를 넘길 때 표가 사라졌다 나타나지 않게 한다 (문제 목록과 같은 이유).
    placeholderData: keepPreviousData,
  })
}

function isNotFound(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 404
}

/**
 * 문제 하나의 기록 (제출 목록 화면 위쪽).
 *
 * 404 `PROBLEM_HISTORY_NOT_FOUND`는 없는 문제·제출한 적 없는 문제·판정이 난 제출이 없는
 * 문제를 구분하지 않는다(계약). 다시 물어도 같은 답이라 404만 재시도하지 않는다 — 5xx와
 * 네트워크 실패는 목록 쿼리처럼 전역 기본값(한 번)대로 다시 해 본다.
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
    staleTime: ALWAYS_FRESH,
    retry: (failureCount, error) => !isNotFound(error) && failureCount < 1,
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
    staleTime: ALWAYS_FRESH,
    // 같은 문제의 다른 페이지일 때만 묵은 표를 둔다. 다른 문제의 제출을 새 문제 제목 아래에
    // 잠깐이라도 보여 주면 안 된다 (같은 화면에서 주소만 바뀌는 뒤로가기).
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1].problemId === problemId ? previous : undefined,
  })
}
