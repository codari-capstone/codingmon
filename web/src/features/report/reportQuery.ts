import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

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

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 오늘(UTC 날짜, `YYYY-MM-DD`). 리포트의 하루 1회는 UTC 날짜로 센다(계약 `reportDate`).
 * 다음 UTC 자정(한국 시각 오전 9시)에 다시 그린다 — 화면을 켜 둔 채 넘기면 끝난 리포트는
 * 다시 받지 않아 '오늘 리포트를 새로 만들 수 있어요'가 뜨지 않았다(#311 리뷰).
 */
export function useUtcToday(): string {
  const [today, setToday] = useState(utcToday)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    // 울릴 때마다 다음 자정에 다시 건다. 날짜가 바뀔 때만 걸면, 타이머가 벽시계보다 조금 일찍 울려
    // 같은 날짜를 읽은 경우 다음 타이머가 영영 걸리지 않는다(#311 리뷰)
    const schedule = () => {
      setToday(utcToday())
      timer = setTimeout(schedule, DAY_MS - (Date.now() % DAY_MS) + 50)
    }
    schedule()
    return () => clearTimeout(timer)
  }, [])
  return today
}

function utcToday(): string {
  return new Date().toISOString().slice(0, 10)
}

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
    // 추천 카드의 풀이 상태는 '지금 기준'이다. 채점 뒤 돌아오면 다시 받는다(learningStatsQuery와 같다, #312 리뷰)
    staleTime: 0,
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
