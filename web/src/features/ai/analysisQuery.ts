import { queryOptions, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { AiQuota, SubmissionAnalysis } from '@/api/types'
import { POLL_INTERVAL_MS } from '@/app/queryClient'
import { problemCode } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { FAILING_INTERVAL_MS, isDeadEnd } from '@/features/result/resultQuery'

export function analysisQueryKey(submissionId: number) {
  return ['analysis', submissionId] as const
}

/** 힌트 단계는 셋이다(AI_FEATURES 4절) */
export const HINT_LEVELS = 3

/**
 * 요금제가 다음 힌트 단계를 열지 않는다(AI-04, PRICE-04). 프로일 때 연 단계가 `maxHintLevel`보다 높아도
 * 그대로 보이고, 3단계를 다 열었으면 잠글 것이 없다(계약 `maxHintLevel`)
 */
export const hintPlanLocked = (a: SubmissionAnalysis) =>
  a.revealedHintLevel < HINT_LEVELS && a.revealedHintLevel + 1 > a.maxHintLevel

/** 이만큼 지나도록 만드는 중이면 덜 자주 묻는다. 보통은 이 안에 끝난다. */
const ANALYSIS_SLOW_AFTER_MS = 10_000
/** 이만큼 지나면 가장 뜸하게 묻는다. */
const ANALYSIS_SLOWEST_AFTER_MS = 60_000

/**
 * 만드는 중(`PENDING`)일 때만 다시 묻는다(계약: "`status`가 `PENDING`이면 바뀔 때까지 `GET`을
 * 주기적으로 부른다"). 실패가 이어지면 채점 결과 폴링과 같은 규칙으로 늦추거나 멈춘다.
 *
 * 채점과 달리 오래 걸릴수록 뜸하게 묻는다. 대기열에 있는 분석은 오래 걸려도 `PENDING`이고,
 * 서버가 처리 중에 내려간 분석은 15분이 지나야 `FAILED`가 된다(계약). 1초 간격이면 그동안
 * 분석 하나에 900번을 묻는다. 기준은 요청한 시각(`createdAt`)이다 — 서버 시계라 어긋날 수
 * 있지만, 어긋나도 간격이 1배와 10배 사이에서 바뀔 뿐이다.
 */
export function analysisPollingInterval(
  error: unknown,
  // 리뷰(codeReviewQuery)도 같은 규칙으로 묻는다. 둘 다 status·createdAt만 본다
  analysis: Pick<SubmissionAnalysis, 'status' | 'createdAt'> | null | undefined,
  now = Date.now(),
): number | false {
  if (analysis?.status !== 'PENDING') return false
  if (isDeadEnd(error, true)) return false
  if (error !== null && error !== undefined) return FAILING_INTERVAL_MS

  const elapsed = now - Date.parse(analysis.createdAt)
  if (elapsed >= ANALYSIS_SLOWEST_AFTER_MS) return POLL_INTERVAL_MS * 10
  if (elapsed >= ANALYSIS_SLOW_AFTER_MS) return POLL_INTERVAL_MS * 3
  return POLL_INTERVAL_MS
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
    queryFn: async ({ client, signal }): Promise<SubmissionAnalysis | null> => {
      // signal을 넘겨야 cancelQueries가 요청을 실제로 끊는다. 안 넘기면 늦게 끝난 응답이
      // 아래 adoptQuota로 방금 받은 새 횟수를 덮는다(#272 리뷰)
      const result = await api.GET('/api/submissions/{id}/analysis', {
        params: { path: { id: submissionId } },
        signal,
      })
      if (result.data !== undefined) {
        // 폴링 응답의 quota가 가장 새 값이다. 만들다 실패(FAILED)하면 요청 때 센 1회가 돌아온다(계약)
        void adoptQuota(client, result.data.quota)
        return result.data
      }
      if (problemCode(result.error) === 'ANALYSIS_NOT_FOUND') return null
      fail(result)
    },
    refetchInterval: (query) => analysisPollingInterval(query.state.error, query.state.data),
    // 잠금 안내가 버튼 자리를 차지해 서버에 다시 물을 길이 없다. 다른 탭에서 결제했을 수 있어
    // 잠긴 동안에는 창에 돌아오면 다시 받는다(#377 리뷰)
    refetchOnWindowFocus: (query) =>
      query.state.data && hintPlanLocked(query.state.data) ? 'always' : false,
    retry: false,
  })
}

export const AI_QUOTA_QUERY_KEY = ['ai-quota'] as const

/**
 * 분석 응답·429 본문이 든 `quota`를 남은 횟수 캐시에 넣는다. 떠 있던 조회가 늦게 끝나
 * 이 값을 옛 값으로 덮지 않게 먼저 취소한다(useRequestAnalysis의 분석 캐시와 같은 순서).
 */
export async function adoptQuota(client: QueryClient, quota: AiQuota) {
  await client.cancelQueries({ queryKey: AI_QUOTA_QUERY_KEY })
  client.setQueryData(AI_QUOTA_QUERY_KEY, quota)
}

/**
 * 오늘 남은 AI 횟수 (AI-01). 조회해도 횟수는 줄지 않는다(계약).
 * 화면은 이 캐시 하나만 읽는다. 분석 조회·요청·힌트 열기의 응답과 429 본문이 든 `quota`는 adoptQuota로 여기에 넣는다.
 */
export function aiQuotaQuery() {
  return queryOptions({
    queryKey: AI_QUOTA_QUERY_KEY,
    queryFn: async ({ signal }) => {
      const result = await api.GET('/api/users/me/ai-quota', { signal })
      if (result.data === undefined) fail(result)
      return result.data
    },
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
      await adoptQuota(queryClient, analysis.quota)
    },
    onError: (error) => onAiRequestError(queryClient, error),
  })
}

/** 분석·리뷰 요청이 실패했을 때. 둘은 하루 한도를 함께 쓴다(계약 `AiQuota`). */
export async function onAiRequestError(client: QueryClient, error: unknown) {
  forgetSessionIfUnauthorized(client, error)
  // 한도 초과(429)는 본문에 거절한 시점의 quota(remaining 0)를 싣는다(계약). fail()이 본문을 펼쳐 던진다
  if (problemCode(error) === 'AI_DAILY_LIMIT_EXCEEDED') {
    const quota = (error as { quota?: AiQuota }).quota
    if (quota) await adoptQuota(client, quota)
    else void client.invalidateQueries({ queryKey: AI_QUOTA_QUERY_KEY })
  }
}

/**
 * [n단계 보기] (AI-04). 다음 단계만 연다 — 계약이 건너뛰기를 409로 막는다.
 *
 * 연 힌트는 학습 통계의 평균 힌트 단계와 제출 기록의 힌트 단계에 들어간다(계약). 그
 * 화면들이 캐시를 들고 있으면 옛 숫자가 보이므로 같이 무효화한다.
 *
 * 다른 탭에서 먼저 열었거나 분석이 바뀌었으면 409(`HINT_LEVEL_SKIPPED`·`ANALYSIS_NOT_READY`·
 * `ANALYSIS_BLOCKED`)다. 화면이 든 상태가 낡은 것이니 분석을 다시 받아 지금 상태로 맞춘다.
 */
export function useRevealHint(submissionId: number) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (level: number): Promise<SubmissionAnalysis> => {
      const result = await api.POST('/api/submissions/{id}/analysis/hints', {
        params: { path: { id: submissionId } },
        body: { level },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
    onSuccess: async (analysis) => {
      await queryClient.cancelQueries({ queryKey: analysisQueryKey(submissionId) })
      queryClient.setQueryData(analysisQueryKey(submissionId), analysis)
      void adoptQuota(queryClient, analysis.quota)
      void queryClient.invalidateQueries({ queryKey: ['learning-stats'] })
      void queryClient.invalidateQueries({ queryKey: ['problem-history'] })
    },
    onError: async (error) => {
      forgetSessionIfUnauthorized(queryClient, error)
      const key = analysisQueryKey(submissionId)
      // 403은 무료 플랜이 열지 않는 단계라는 뜻이다(계약). 다시 받기를 기다리지 않고 캐시에 바로 잠금을 들인다.
      // 기다리면 그 사이 오류 문구가 뜨고, 다시 받기가 실패하면 버튼이 살아나 403을 되풀이한다(#377 리뷰).
      // 오류 상태가 화면에 닿기 전에 끝나도록 기다린다(onError가 끝나야 mutation이 오류가 된다)
      if (problemCode(error) === 'HINT_PLAN_REQUIRED') {
        await queryClient.cancelQueries({ queryKey: key })
        queryClient.setQueryData<SubmissionAnalysis | null>(key, (old) =>
          old ? { ...old, maxHintLevel: 1 } : old,
        )
      }
      // 409(단계가 어긋남)와 403은 화면의 분석이 낡은 것이다. 다시 받아 지금 단계와 요금제에 맞춘다
      const status = (error as { status?: number }).status
      if (status === 409 || status === 403) {
        void queryClient.invalidateQueries({ queryKey: key })
      }
    },
  })
}
