import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { ConceptStat } from '@/api/types'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { learningStatsQuery } from './reportQuery'

/**
 * 해결률만 백분율로 바꾼다 (0.49 → 49%, 계약 `ConceptStat`). 서버가 소수 둘째 자리까지
 * 반올림해 보내므로 ×100은 정수다. 반올림은 부동소수 오차(0.57 × 100 = 56.99…)만 정리한다.
 */
function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

/** 취약 점수 칸: 숫자는 서버 값 그대로, 막대는 눈으로 비교하라고 곁들인 것이다 (REP-06). */
function Score({ concept }: { concept: ConceptStat }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 tabular-nums">{concept.weaknessScore}</span>
      <div aria-hidden className="bg-border h-2 w-24 overflow-hidden rounded-full">
        <div className="bg-primary h-full" style={{ width: `${concept.weaknessScore * 100}%` }} />
      </div>
    </div>
  )
}

/** 학습 리포트 — 개념별 통계 (REP-01·02). */
export function Component() {
  const { data, isPending, error, refetch } = useQuery(learningStatsQuery())

  // 세션이 끊겼으면 로그인 화면으로 보낸다 (session.ts).
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  return (
    <section className="flex flex-col gap-4">
      <h1 className="page-title">학습 리포트</h1>

      {isPending && !error ? <ListSkeleton rows={4} /> : null}

      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error ? (
        data.remainingProblemCount > 0 ? (
          // 조건 미달이면 concepts는 빈 배열이다(계약). 갈 곳을 함께 준다 (UX-03).
          <EmptyState
            title={`${data.remainingProblemCount}문제 더 맞히면 리포트를 볼 수 있어요`}
            description={`맞힌 서로 다른 문제가 ${data.requiredProblemCount}개 이상이면 개념별 통계를 보여 줘요. 지금 ${data.solvedProblemCount}문제를 맞혔어요.`}
            action={{ label: '문제 보러 가기', to: '/problems' }}
          />
        ) : (
          <>
            <p className="text-muted-foreground text-sm">
              맞힌 문제 {data.solvedProblemCount}개와 제출한 모든 문제로 계산했어요. 취약 점수가
              높을수록 더 연습이 필요한 개념이에요.
            </p>
            {/* 순서는 서버가 정했다(취약 점수 높은 순). 다시 정렬하지 않는다. */}
            <div className="bg-card rounded-lg border px-3 py-2">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>개념</TableHead>
                    <TableHead className="w-28">해결률</TableHead>
                    <TableHead className="w-28">평균 힌트 단계</TableHead>
                    <TableHead className="w-24">평균 시도</TableHead>
                    <TableHead className="w-44">취약 점수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.concepts.map((concept) => (
                    <TableRow key={concept.slug}>
                      <TableCell className="font-medium">
                        {concept.name}
                        {concept.weak ? (
                          <span className="bg-destructive/10 text-destructive-text ml-2 rounded px-1.5 py-0.5 text-xs">
                            취약
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {percent(concept.solveRate)}
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({concept.solvedCount}/{concept.problemCount})
                        </span>
                      </TableCell>
                      <TableCell className="tabular-nums">{concept.averageHintLevel}</TableCell>
                      <TableCell className="tabular-nums">{concept.averageAttempts}</TableCell>
                      <TableCell>
                        <Score concept={concept} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )
      ) : null}
    </section>
  )
}
