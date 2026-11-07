import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { SubmissionAnalysis } from '@/api/types'
import { POLL_INTERVAL_MS } from '@/app/queryClient'
import { problemCode } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { FAILING_INTERVAL_MS, isDeadEnd } from '@/features/result/resultQuery'

export function analysisQueryKey(submissionId: number) {
  return ['analysis', submissionId] as const
}

/**
 * 만드는 중(`PENDING`)일 때만 다시 묻는다(계약: "`status`가 `PENDING`이면 바뀔 때까지 `GET`을
 * 주기적으로 부른다"). 실패가 이어지면 채점 결과 폴링과 같은 규칙으로 늦추거나 멈춘다.
 */
export function analysisPollingInterval(
  error: unknown,
  analysis: SubmissionAnalysis | null | undefined,
): number | false {
  if (analysis?.status !== 'PENDING') return false
  if (isDeadEnd(error, true)) return false
  return error === null || error === undefined ? POLL_INTERVAL_MS : FAILING_INTERVAL_MS
}

/**
 * 저장된 AI 오답 분석 (AI-02·03). 요청한 적이 없으면 null이다.
 *
 * 계약은 요청하지 않은 제출을 "정상적으로 404 `ANALYSIS_NOT_FOUND`"라고 적었다. 오류로 두면
 * 결과 화면에 들어올 때마다 오류가 뜨므로 '아직 없음'으로 바꾼다. 남의 제출도 같은 404지만
 * 결과 조회가 먼저 404로 막는다.
 */
export function analysisQuery(submissionId: number) {
  return queryOptions({
    queryKey: analysisQueryKey(submissionId),
    queryFn: async (): Promise<SubmissionAnalysis | null> => {
      const result = await api.GET('/api/submissions/{id}/analysis', {
        params: { path: { id: submissionId } },
      })
      if (result.data !== undefined) return result.data
      if (problemCode(result.error) === 'ANALYSIS_NOT_FOUND') return null
      fail(result)
    },
    refetchInterval: (query) => analysisPollingInterval(query.state.error, query.state.data),
    retry: false,
  })
}

/**
 * [AI 분석]·[다시 시도] (AI-01·02). `FAILED`에서 다시 누르는 것이 재시도다(계약).
 *
 * 응답을 캐시에 넣으면 `PENDING`일 때 위 쿼리의 폴링이 이어받는다. 무효화하지 않는다 —
 * 방금 받은 상태를 한 번 더 묻는 왕복이다.
 */
export function useRequestAnalysis(submissionId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<SubmissionAnalysis> => {
      const result = await api.POST('/api/submissions/{id}/analysis', {
        params: { path: { id: submissionId } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
    onSuccess: async (analysis) => {
      // 떠 있던 조회가 늦게 끝나 방금 받은 상태를 덮지 않게 먼저 취소한다(adoptSession과 같은 순서).
      await queryClient.cancelQueries({ queryKey: analysisQueryKey(submissionId) })
      queryClient.setQueryData(analysisQueryKey(submissionId), analysis)
    },
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })
}
