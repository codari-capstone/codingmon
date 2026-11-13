import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { SubmissionCodeReview } from '@/api/types'
import { problemCode } from '@/features/auth/problemCode'
import { adoptQuota, analysisPollingInterval, onAiRequestError } from './analysisQuery'

export function codeReviewQueryKey(submissionId: number) {
  return ['code-review', submissionId] as const
}

/**
 * 저장된 AI 코드 리뷰 (AI-05). 요청한 적이 없으면 null이다 — 계약이 "정상적으로 404"라고 적은 경우다
 * (analysisQuery와 같은 이유). 만드는 중이면 분석과 같은 간격으로 다시 묻는다.
 */
export function codeReviewQuery(submissionId: number) {
  return queryOptions({
    queryKey: codeReviewQueryKey(submissionId),
    queryFn: async ({ client, signal }): Promise<SubmissionCodeReview | null> => {
      const result = await api.GET('/api/submissions/{id}/code-review', {
        params: { path: { id: submissionId } },
        signal,
      })
      if (result.data !== undefined) {
        void adoptQuota(client, result.data.quota)
        return result.data
      }
      if (problemCode(result.error) === 'CODE_REVIEW_NOT_FOUND') return null
      fail(result)
    },
    refetchInterval: (query) => analysisPollingInterval(query.state.error, query.state.data),
    retry: false,
  })
}

/** [AI 리뷰]·[다시 시도] (AI-05). 캐시·한도 처리는 useRequestAnalysis와 같다. */
export function useRequestCodeReview(submissionId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (): Promise<SubmissionCodeReview> => {
      const result = await api.POST('/api/submissions/{id}/code-review', {
        params: { path: { id: submissionId } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
    onSuccess: async (review) => {
      await queryClient.cancelQueries({ queryKey: codeReviewQueryKey(submissionId) })
      queryClient.setQueryData(codeReviewQueryKey(submissionId), review)
      await adoptQuota(queryClient, review.quota)
    },
    onError: (error) => onAiRequestError(queryClient, error),
  })
}
