import { Link } from 'react-router'

import type { LearningReport } from '@/api/types'
import { StatusText } from '@/components/StatusText'
import { Badge } from '@/components/ui/badge'
import { DIFFICULTY_LABEL, SOLVE_STATUS_LABEL, SOLVE_STATUS_TONE } from '@/features/problems/labels'
import { cn } from '@/lib/utils'
import { AI_TEXT } from './ReportAnalysis'

/**
 * 다음에 풀 문제 (REP-04). 리포트를 만들 때 서버가 고른 문제를 순위 순서 그대로 보인다(계약) — 다시 정렬하지 않는다.
 * - 근거 개념(`concept`)이 null이면 취약 개념에서 고를 문제가 모자라 고른 도전 문제다. 개념·점수 없이 보인다
 * - 추천 이유(`reason`)는 AI 문장이라 `COMPLETED`일 때만 있다. null이면 문장만 빼고 대체 문구를 만들지 않는다(#84 결정)
 * - 풀이 상태는 조회한 지금의 값이다. 추천받은 뒤 맞힌 문제는 '맞음'으로 온다
 */
export function ReportRecommendations({
  recommendations,
}: {
  recommendations: LearningReport['recommendations']
}) {
  return (
    <section aria-labelledby="report-next" className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-1">
        <h2 id="report-next" className="text-foreground text-xl font-semibold">
          다음에 풀 문제
        </h2>
        {recommendations.length > 0 ? (
          <p className="text-muted-foreground text-sm">
            리포트를 만들 때 약한 개념에서 골랐어요. 풀이 상태는 지금 기준이에요.
          </p>
        ) : null}
      </div>
      {recommendations.length === 0 ? (
        // 공개 문제를 거의 다 맞혔을 때만 비거나 3개보다 적다(계약)
        <p className="text-muted-foreground text-sm">
          추천할 문제가 없어요. 공개된 문제를 거의 다 맞혔어요.
        </p>
      ) : (
        <ol className="m-0 grid list-none gap-4 p-0 md:grid-cols-3">
          {recommendations.map((r) => (
            <li key={r.rank} className="min-w-0">
              {/*
                링크 이름은 순위·제목·풀이 상태만이다. 카드 전체가 링크라 그대로 두면 여러 문장짜리 추천 이유까지
                이름이 되어, 링크 목록에서 문제를 고르기 어렵다(#312 리뷰). 이유는 카드를 읽을 때 보인다
              */}
              <Link
                to={`/problems/${r.problemId}`}
                aria-labelledby={`next-${r.rank}-rank next-${r.rank}-title next-${r.rank}-status`}
                className="bg-card hover:border-primary hover:shadow-hover focus-visible:outline-ring flex h-full flex-col gap-3 rounded-lg border p-5 no-underline transition-[border-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
              >
                <span className="flex items-center justify-between gap-2">
                  <span
                    id={`next-${r.rank}-rank`}
                    className="bg-accent text-primary-text inline-flex size-7 items-center justify-center rounded-full text-sm font-bold tabular-nums"
                  >
                    {/* 낭독은 '추천 1위'로 한 덩어리다. 글자를 나누면 이름을 지을 때 띄어쓰기가 빠진다 */}
                    <span className="sr-only">추천 {r.rank}위</span>
                    <span aria-hidden="true">{r.rank}</span>
                  </span>
                  <span id={`next-${r.rank}-status`}>
                    <StatusText tone={SOLVE_STATUS_TONE[r.solveStatus]} className="text-[13px]">
                      {SOLVE_STATUS_LABEL[r.solveStatus]}
                    </StatusText>
                  </span>
                </span>
                <span
                  id={`next-${r.rank}-title`}
                  className="text-foreground text-[17px] leading-[1.4] font-bold tracking-[-0.01em] break-keep [overflow-wrap:anywhere]"
                >
                  {r.title}
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {/* 난이도는 다른 화면처럼 outline이다(Badge README) */}
                  <Badge tone="outline">{DIFFICULTY_LABEL[r.difficulty]}</Badge>
                  {r.concept ? (
                    // 개념 이름은 관리자가 정한다. Badge는 한 줄 고정이라 긴 이름이 카드 밖으로 넘친다(#266·#273 리뷰와 같은 문제)
                    <Badge
                      tone="warning"
                      className="h-auto min-h-[26px] py-1 break-keep whitespace-normal [overflow-wrap:anywhere]"
                    >
                      {r.concept.name} · 취약 점수 {r.concept.weaknessScore}
                    </Badge>
                  ) : (
                    <Badge>도전 문제</Badge>
                  )}
                </span>
                {r.reason ? (
                  <span className={cn('text-body-foreground text-sm leading-[1.6]', AI_TEXT)}>
                    {r.reason}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
