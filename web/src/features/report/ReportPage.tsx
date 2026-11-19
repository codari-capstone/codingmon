import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'

import type { ConceptStat, LearningReport } from '@/api/types'
import scene from '@/assets/scenes/streak_chart.png'
import { EmptyState } from '@/components/EmptyState'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { LoadingState } from '@/components/LoadingState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, type TableColumn } from '@/components/ui/data-table'
import { Progress } from '@/components/ui/progress'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { cn } from '@/lib/utils'
import { LearnNav } from './LearnNav'
import { AiAnalysis, ReportMeta, RequestError, type ReportRequest } from './ReportAnalysis'
import { ReportRecommendations } from './ReportRecommendations'
import { isDeadEnd } from '@/features/result/resultQuery'
import {
  learningReportQuery,
  learningStatsQuery,
  useRequestLearningReport,
  useUtcToday,
} from './reportQuery'

/**
 * 해결률만 백분율로 바꾼다 (0.49 → 49%, 계약 `ConceptStat`). 서버가 소수 둘째 자리까지
 * 반올림해 보내므로 ×100은 정수다. 반올림은 부동소수 오차(0.57 × 100 = 56.99…)만 정리한다.
 */
function percent(rate: number): string {
  return `${Math.round(rate * 100)}%`
}

const HERO_TITLE_ID = 'report-title'

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
        // 보이는 글자는 수치다. 막대 이름까지 '25%'면 무엇의 막대인지 읽히지 않는다(#271 리뷰)
        name={`${concept.name} 해결률`}
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

/** 남색 머리: 가장 취약한 개념을 권한다. 순서는 서버가 정했다(취약 점수 높은 순). 리포트 저장본의 값이다. */
function Hero({ stats }: { stats: Pick<LearningReport, 'concepts' | 'solvedProblemCount'> }) {
  const weakest = stats.concepts.find((concept) => concept.weak)
  return (
    <Card
      as="section"
      tone="inverse"
      aria-label="요약"
      className="flex flex-wrap items-center gap-6 overflow-hidden px-6 pt-9 pb-0 sm:px-10"
    >
      <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-3 pb-9">
        <p className="text-eyebrow text-inverse-accent">학습 리포트</p>
        {/* 시안처럼 '조금 더' 뒤에서 줄을 바꾼다(#275). 줄바꿈은 화면 낭독기에는 띄어쓰기로 읽힌다 */}
        {/* tabIndex -1: 첫 리포트가 생기면 포커스를 받는다(Component) */}
        <h1
          id={HERO_TITLE_ID}
          tabIndex={-1}
          className="text-[28px] leading-[1.25] font-bold tracking-[-0.025em] break-keep whitespace-pre-line outline-none sm:text-[36px]"
        >
          {weakest
            ? `${weakest.name} 개념을 조금 더\n연습해 볼까요?`
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

/**
 * 리포트를 한 번도 만들지 않았을 때 (REP-01). 학습 통계로 조건 미달 안내와 첫 리포트 권유를 가른다.
 * 표와 머리는 리포트를 만든 뒤 저장본으로 그린다 — 숫자의 출처를 하나로 둔다(#46).
 */
function NoReport({ request }: { request: ReportRequest }) {
  const { data, isPending, error, refetch } = useQuery(learningStatsQuery())
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  if (error) return <ErrorState problem={error} onRetry={() => void refetch()} />
  if (isPending) return <ListSkeleton rows={2} />
  // 아래 권유(<= 0)와 빈틈없이 갈리게 > 0으로 본다. 계약 밖 음수도 권유로 간다
  if (data.remainingProblemCount > 0) {
    // 조건 미달이면 concepts는 빈 배열이다(계약). 갈 곳을 함께 준다 (UX-03).
    return (
      <EmptyState
        title={`${data.remainingProblemCount}문제 더 맞히면 리포트를 볼 수 있어요`}
        description={`맞힌 서로 다른 문제가 ${data.requiredProblemCount}개 이상이면 개념별 통계를 보여 줘요. 지금 ${data.solvedProblemCount}문제를 맞혔어요.`}
        action={{ label: '문제 보러 가기', to: '/problems' }}
      />
    )
  }
  return (
    <Card as="section" aria-labelledby="report-invite" className="flex flex-col items-start gap-3">
      <h2 id="report-invite" className="text-foreground text-xl font-semibold">
        첫 학습 리포트를 만들어 볼까요?
      </h2>
      <p className="text-muted-foreground text-[15px] leading-[1.65]">
        맞힌 문제 {data.solvedProblemCount}개로 개념별 통계를 정리하고, AI가 약한 개념을 쉬운 말로
        풀어 줘요. 하루 한 번 새로 만들 수 있어요.
      </p>
      <Button className="mt-1" loading={request.isPending} onClick={() => request.mutate()}>
        리포트 보기
      </Button>
      <RequestError request={request} />
    </Card>
  )
}

/** 개념별 결과 표 (REP-02). 순서는 서버가 정했다(취약 점수 높은 순). 다시 정렬하지 않는다. */
function ConceptTable({ concepts }: { concepts: ConceptStat[] }) {
  return (
    <section aria-labelledby="concept-results" className="flex flex-col gap-3.5">
      <h2 id="concept-results" className="text-foreground text-xl font-semibold">
        개념별 결과
      </h2>
      <div className="bg-card rounded-lg border px-3 py-2">
        <Table
          columns={COLUMNS}
          rows={concepts.map((concept) => ({ ...concept, id: concept.slug }))}
          className="whitespace-nowrap"
        />
      </div>
    </section>
  )
}

/**
 * 만드는 중·끝남을 낭독한다. 화면에 늘 있어야 한다 — AI 분석 구역은 첫 리포트가 생길 때 새로 붙고,
 * 많은 화면 낭독기는 새로 붙은 live region의 첫 글을 읽지 않는다(#311 리뷰).
 * '마쳤어요'는 이 화면에서 만드는 중을 본 뒤 끝났을 때만 알린다 — 열자마자 끝난 리포트나
 * 다시 만들기 요청이 실패해 돌아온 경우에 알리면 사실과 다르다.
 */
function ReportAnnouncer({ status }: { status: LearningReport['status'] | undefined }) {
  const [last, setLast] = useState(status)
  const [finished, setFinished] = useState(false)
  if (status !== last) {
    setFinished(last === 'PENDING' && status === 'COMPLETED')
    setLast(status)
  }
  return (
    <p role="status" className="sr-only">
      {status === 'PENDING' ? 'AI가 분석 문장을 쓰고 있어요. 숫자는 먼저 볼 수 있어요.' : ''}
      {finished ? 'AI 분석을 마쳤어요.' : ''}
    </p>
  )
}

/** 학습 리포트 (REP-01~05). 하루 1회 만든 저장본을 보여 준다(계약). */
export function Component() {
  const { data: report, isPending, error, refetch } = useQuery(learningReportQuery())
  const mutation = useRequestLearningReport()
  const today = useUtcToday()

  // 세션이 끊겼으면 로그인 화면으로 보낸다 (session.ts).
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  // 받아 둔 리포트가 있는데 폴링 한 번이 일시적으로 실패하면 화면을 내리지 않는다 — 폴링이 간격을 늘려
  // 계속 묻는다. 오류를 띄우는 때와 폴링을 멈추는 때가 같다(resultQuery의 isDeadEnd, #311 리뷰).
  // '아직 없음'(null)은 지킬 화면이 아니다. 다시 받다 실패한 것을 권유 카드로 덮으면 다시 묻지도 않는다
  const deadEnd = isDeadEnd(error, report != null)
  const shown = deadEnd ? undefined : report

  // [리포트 보기]·[다시 시도]가 성공하면 누른 버튼이 사라진다(권유 카드, 지난 날짜 안내, 실패 블록).
  // 요청이 끝났는데 포커스가 body로 떨어졌으면 머리 제목으로 옮긴다. 버튼이 남았으면 그대로 둔다(#311 리뷰)
  const pressed = useRef(false)
  useEffect(() => {
    if (!pressed.current || mutation.isPending) return
    pressed.current = false
    const active = document.activeElement
    if (shown && (active === null || active === document.body)) {
      document.getElementById(HERO_TITLE_ID)?.focus()
    }
  }, [shown, mutation.isPending])
  const request = {
    ...mutation,
    mutate: () => {
      pressed.current = true
      mutation.mutate()
    },
  }

  return (
    <section className="flex flex-col gap-7">
      <div>
        <LearnNav />
      </div>
      <ReportAnnouncer status={shown?.status} />

      {/* 리포트가 있으면 남색 머리의 권유 문장이 h1이다. 없을 때도 화면 제목은 둔다 */}
      {shown ? <Hero stats={shown} /> : <h1 className="page-title">학습 리포트</h1>}

      {deadEnd ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}
      {isPending && !deadEnd ? <LoadingState /> : null}
      {shown === null ? <NoReport request={request} /> : null}

      {shown ? (
        <>
          <ReportMeta report={shown} request={request} today={today} />
          <AiAnalysis report={shown} request={request} today={today} />
          <ReportRecommendations recommendations={shown.recommendations} />
          <ConceptTable concepts={shown.concepts} />
        </>
      ) : null}
    </section>
  )
}
