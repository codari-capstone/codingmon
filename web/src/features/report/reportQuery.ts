import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { LearningReport, LearningStats } from '@/api/types'
import { analysisPollingInterval } from '@/features/ai/analysisQuery'
import { problemCode } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'

/**
 * 개념별 학습 통계 (REP-01). 서버가 요청할 때마다 다시 계산하므로(계약) 매번 새로 받는다.
 * 리포트가 없을 때(404) 조건 미달 안내와 첫 리포트 권유를 가르는 데만 쓴다. 표는 리포트 저장본이다.
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

export const LEARNING_REPORT_QUERY_KEY = ['learning-report'] as const

/**
 * 마지막 학습 리포트 (REP-02~05). 한 번도 만들지 않았으면 null이다 — 계약의 404
 * `LEARNING_REPORT_NOT_FOUND`를 오류로 두면 처음 온 사람마다 오류 화면을 본다(분석 조회와 같은 선택).
 *
 * 만드는 중(`PENDING`)이면 분석과 같은 규칙으로 다시 묻는다. 기준 시각은 만들기 시작한 `generatedAt`이다.
 * 사용자별 응답이라 키가 `adoptSession`의 제거 대상에 들어 있어야 한다(session.ts).
 */
export function learningReportQuery() {
  return queryOptions({
    queryKey: LEARNING_REPORT_QUERY_KEY,
    queryFn: async ({ signal }): Promise<LearningReport | null> => {
      const result = await api.GET('/api/users/me/learning-report', { signal })
      if (result.data !== undefined) return result.data
      if (problemCode(result.error) === 'LEARNING_REPORT_NOT_FOUND') return null
      fail(result)
    },
    refetchInterval: ({ state }) =>
      analysisPollingInterval(
        state.error,
        state.data && { status: state.data.status, createdAt: state.data.generatedAt },
      ),
    retry: false,
  })
}

/**
 * [리포트 보기]·[다시 시도] (REP-03~05). 오늘 것이 있으면 그것을, 없거나 `FAILED`면 새로 만들기 시작한다(계약).
 * 응답을 캐시에 넣으면 `PENDING`일 때 위 쿼리의 폴링이 이어받는다.
 *
 * 맞힌 문제가 모자라면 409 `LEARNING_REPORT_NOT_AVAILABLE`이다. 화면이 든 통계가 낡은 것이라
 * 다시 받아 조건 미달 안내(REP-01)로 바꾼다.
 */
export function useRequestLearningReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<LearningReport> => {
      const result = await api.POST('/api/users/me/learning-report')
      if (result.data === undefined) fail(result)
      return result.data
    },
    onSuccess: async (report) => {
      // 떠 있던 조회가 늦게 끝나 방금 받은 상태를 덮지 않게 먼저 취소한다(useRequestAnalysis와 같은 순서)
      await queryClient.cancelQueries({ queryKey: LEARNING_REPORT_QUERY_KEY })
      queryClient.setQueryData(LEARNING_REPORT_QUERY_KEY, report)
    },
    onError: (error) => {
      forgetSessionIfUnauthorized(queryClient, error)
      if (problemCode(error) === 'LEARNING_REPORT_NOT_AVAILABLE') {
        void queryClient.invalidateQueries({ queryKey: ['learning-stats'] })
      }
    },
  })
}
