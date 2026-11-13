import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router'

import type { ConceptStat, LearningStats } from '@/api/types'
import scene from '@/assets/scenes/streak_chart.png'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, type TableColumn } from '@/components/ui/data-table'
import { Progress } from '@/components/ui/progress'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { cn } from '@/lib/utils'
import { LearnNav } from './LearnNav'
import { learningStatsQuery } from './reportQuery'

/**
 * 해결률만 백분율로 바꾼다 (0.49 → 49%, 계약 `ConceptStat`). 서버가 소수 둘째 자리까지
 * 반올림해 보내므로 ×100은 정수다. 반올림은 부동소수 오차(0.57 × 100 = 56.99…)만 정리한다.
 */
function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

type Row = ConceptStat & { id: string }

const COLUMNS: TableColumn<Row>[] = [
  {
    key: 'name',
    header: '개념',
    render: (concept) => (
      <span className="text-foreground inline-flex items-center gap-2 font-semibold">
        {concept.name}
        {/* 취약 여부는 서버의 weak만 따른다(계약) */}
        {concept.weak ? <Badge tone="warning">취약</Badge> : null}
      </span>
    ),
  },
  {
    key: 'solveRate',
    header: '해결률',
    width: '260px',
    render: (concept) => (
      <Progress
        value={concept.solvedCount}
        max={concept.problemCount}
        label={percent(concept.solveRate)}
        showValue
        tone={concept.solvedCount === concept.problemCount ? 'success' : 'brand'}
        // 좁은 화면에서 열이 줄어 '100%'와 '2 / 2'가 붙지 않게 한다 (표는 가로 스크롤)
        className="min-w-[200px]"
      />
    ),
  },
  {
    key: 'averageHintLevel',
    header: '평균 힌트 단계',
    align: 'right',
    render: (concept) => <span className="tabular-nums">{concept.averageHintLevel}</span>,
  },
  {
    key: 'averageAttempts',
    header: '평균 시도',
    align: 'right',
    render: (concept) => <span className="tabular-nums">{concept.averageAttempts}</span>,
  },
  {
    key: 'weaknessScore',
    header: '취약 점수',
    width: '220px',
    // 숫자는 서버 값 그대로, 막대는 눈으로 비교하라고 곁들인 것이다 (REP-06)
    render: (concept) => (
      <span className="flex items-center gap-2.5">
        <span aria-hidden className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
          <span
            className={cn(
              'block h-full rounded-full',
              concept.weak ? 'bg-warning' : 'bg-muted-foreground/50',
            )}
            style={{ width: `${concept.weaknessScore * 100}%` }}
          />
        </span>
        <b className="text-foreground w-9 text-right tabular-nums">{concept.weaknessScore}</b>
      </span>
    ),
  },
]

/** 남색 머리: 가장 취약한 개념을 권한다. 순서는 서버가 정했다(취약 점수 높은 순). */
function Hero({ stats }: { stats: LearningStats }) {
  const weakest = stats.concepts.find((concept) => concept.weak)
  return (
    <Card
      as="section"
      tone="inverse"
      padding="lg"
      aria-label="요약"
      className="flex flex-wrap items-center gap-6 overflow-hidden px-6 pt-9 pb-0 sm:px-10"
    >
      <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-3 pb-9">
        <p className="text-eyebrow text-inverse-accent">학습 리포트</p>
        <h1 className="text-[28px] leading-[1.25] font-bold tracking-[-0.025em] break-keep sm:text-[36px]">
          {weakest
            ? `${weakest.name} 개념을 조금 더 연습해 볼까요?`
            : '모든 개념을 고르게 잘 풀고 있어요'}
        </h1>
        <p className="text-inverse-muted text-base leading-[1.65]">
          맞힌 문제 {stats.solvedProblemCount}개와 제출한 모든 문제로 계산했어요.{' '}
          <b className="text-inverse-foreground font-semibold">취약 점수가 높을수록</b> 더 연습이
          필요한 개념이에요.
        </p>
        <div className="mt-2 flex flex-wrap gap-2.5">
          <Button asChild>
            <Link to={weakest ? `/problems?tag=${encodeURIComponent(weakest.slug)}` : '/problems'}>
              {weakest ? `${weakest.name} 문제 풀기` : '문제 풀러 가기'}
            </Link>
          </Button>
          <Button asChild variant="glass">
            <Link to="/me">마이페이지</Link>
          </Button>
        </div>
      </div>
      <img
        src={scene}
        alt=""
        width={300}
        height={235}
        className="mx-auto block h-auto max-w-full self-end"
      />
    </Card>
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

  const ready = data && !error && data.remainingProblemCount === 0

  return (
    <section className="flex flex-col gap-7">
      <div>
        <LearnNav />
      </div>

      {/* 통계가 있으면 남색 머리의 권유 문장이 h1이다. 없을 때도 화면 제목은 둔다 */}
      {ready ? <Hero stats={data} /> : <h1 className="page-title">학습 리포트</h1>}

      {isPending && !error ? <ListSkeleton rows={4} /> : null}

      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error && data.remainingProblemCount > 0 ? (
        // 조건 미달이면 concepts는 빈 배열이다(계약). 갈 곳을 함께 준다 (UX-03).
        <EmptyState
          title={`${data.remainingProblemCount}문제 더 맞히면 리포트를 볼 수 있어요`}
          description={`맞힌 서로 다른 문제가 ${data.requiredProblemCount}개 이상이면 개념별 통계를 보여 줘요. 지금 ${data.solvedProblemCount}문제를 맞혔어요.`}
          action={{ label: '문제 보러 가기', to: '/problems' }}
        />
      ) : null}

      {ready ? (
        <section aria-labelledby="concept-results" className="flex flex-col gap-3.5">
          <h2 id="concept-results" className="text-foreground text-xl font-semibold">
            개념별 결과
          </h2>
          {/* 순서는 서버가 정했다(취약 점수 높은 순). 다시 정렬하지 않는다. */}
          <div className="bg-card rounded-lg border px-3 py-2">
            <Table
              columns={COLUMNS}
              rows={data.concepts.map((concept) => ({ ...concept, id: concept.slug }))}
              className="whitespace-nowrap"
            />
          </div>
        </section>
      ) : null}
    </section>
  )
}
