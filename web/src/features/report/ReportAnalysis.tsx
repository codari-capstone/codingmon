import type { LearningReport } from '@/api/types'
import codingmonFace from '@/assets/brand/codingmon_face.png'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { failureText } from '@/features/ai/failureText'
import { problemMessage } from '@/features/auth/problemCode'

/** [리포트 보기]·[다시 시도]가 같이 쓰는 요청 (useRequestLearningReport). */
export interface ReportRequest {
  mutate: () => void
  isPending: boolean
  isError: boolean
  isSuccess: boolean
  error: unknown
  data?: LearningReport
}

const MADE_AT = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

/** 모델 문장. 띄어쓰기 없는 긴 식·주소가 오면 줄을 바꿀 곳이 없어 카드 밖으로 넘친다(#311 리뷰) */
const AI_TEXT = 'break-keep whitespace-pre-line [overflow-wrap:anywhere]'

/** 요청이 실패한 이유. 리포트의 FAILED가 아니라 요청 자체(네트워크·409 등)의 실패다. */
export function RequestError({ request }: { request: ReportRequest }) {
  if (!request.isError) return null
  return (
    <p role="alert" className="text-destructive-text text-sm">
      {problemMessage(request.error)}
    </p>
  )
}

/**
 * 만든 날짜와 하루 1회 안내 (REP-05). `generatedAt`은 만들기 시작한 시각이다(계약).
 * 하루는 UTC 날짜라 한국 시각 오전 9시에 바뀐다. 오늘 것이 아니면 새로 만들 수 있다고 알린다(계약).
 */
export function ReportMeta({
  report,
  request,
  today,
}: {
  report: LearningReport
  request: ReportRequest
  /** 오늘(UTC 날짜). useUtcToday가 날짜가 바뀌면 다시 그린다 */
  today: string
}) {
  const stale = report.reportDate !== today
  // '오늘'은 브라우저 시계다. 서버 시계가 늦으면 눌러도 같은 날짜의 리포트가 돌아온다(계약: 오늘 것이 있으면 그것).
  // 아무 반응 없는 버튼으로 두지 않고 알린다 — 시계 차이만큼 지나 다시 누르면 만들어진다(#311 리뷰)
  const serverNotYet = stale && request.isSuccess && request.data?.reportDate === report.reportDate
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-muted-foreground text-sm">
          {MADE_AT.format(new Date(report.generatedAt))}에 만든 리포트예요 · 하루 한 번(오전 9시에
          바뀌어요) 새로 만들 수 있어요
        </p>
        {stale ? (
          <div className="flex items-center gap-3">
            <span className="text-foreground text-sm font-semibold">
              오늘 리포트를 새로 만들 수 있어요
            </span>
            <Button size="sm" loading={request.isPending} onClick={() => request.mutate()}>
              리포트 보기
            </Button>
          </div>
        ) : null}
      </div>
      {stale ? <RequestError request={request} /> : null}
      {serverNotYet ? (
        <p role="status" className="text-muted-foreground text-sm">
          서버 시각으로는 아직 하루가 지나지 않았어요. 잠시 후 다시 눌러 주세요.
        </p>
      ) : null}
    </div>
  )
}

/**
 * AI 분석 문장 (REP-03). 수치·개념은 서버가 계산한 저장본이고 AI는 문장만 쓴다(계약).
 * 문장은 `COMPLETED`일 때만 있고, 서버가 수치를 대조해 지운 글은 null이다 — 빼고 보여 준다.
 * 모델이 쓴 글이라 Markdown·HTML로 그리지 않고 글자 그대로 둔다(계약).
 */
export function AiAnalysis({
  report,
  request,
  today,
}: {
  report: LearningReport
  request: ReportRequest
  today: string
}) {
  // 요청 중인지는 보지 않는다. 누른 버튼이 기다림을 보이고, 응답이 PENDING이면 그때 바뀐다.
  // 요청만으로 바꾸면 실패한 블록과 버튼이 사라지거나(#311 리뷰), 지난 리포트를 다시 만들다
  // 실패했을 때 문장이 사라졌다 돌아온다
  const working = report.status === 'PENDING'
  const failed = report.status === 'FAILED'
  const done = report.status === 'COMPLETED'
  const concepts = report.weakConcepts.filter((c) => c.explanation || c.practice)

  return (
    <section
      aria-labelledby="report-ai-heading"
      className="bg-card flex flex-col gap-5 rounded-lg border p-6 sm:p-7"
    >
      {/* 보이는 안내다. 낭독은 화면에 늘 있는 ReportAnnouncer가 맡는다 — 이 구역은 리포트가 생길 때 새로 붙는다 */}
      {working ? (
        <p className="text-muted-foreground text-sm">
          AI가 분석 문장을 쓰고 있어요. 숫자는 먼저 볼 수 있어요.
        </p>
      ) : null}
      <div className="-order-1 flex items-center gap-3">
        {/* 결과 화면 AI 분석과 같은 화자 표시. 장식이라 alt를 비운다 */}
        <span className="bg-accent inline-flex size-11 flex-none overflow-hidden rounded-full">
          <img src={codingmonFace} alt="" width={44} height={44} className="block" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id="report-ai-heading" className="text-foreground text-lg font-bold">
            AI 분석
          </h2>
          <p className="text-muted-foreground mt-0.5 text-[13px]">
            서버가 계산한 숫자를 AI가 쉬운 말로 풀어 썼어요. 숫자는 아래 표와 같아요.
          </p>
        </div>
      </div>

      {failed ? (
        <div className="flex flex-col items-start gap-3">
          <p role="alert" className="text-destructive-text text-sm">
            {failureText(report.failureReason, '리포트를')}
          </p>
          {/* 지난 날짜면 위 [리포트 보기]가 같은 일을 한다. 버튼을 둘 두지 않는다 */}
          {report.reportDate === today ? (
            <>
              <Button
                variant="secondary"
                loading={request.isPending}
                onClick={() => request.mutate()}
              >
                다시 시도
              </Button>
              <RequestError request={request} />
            </>
          ) : null}
        </div>
      ) : null}

      {done && !report.summary && concepts.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          이번 리포트에는 보여 줄 수 있는 AI 분석 문장이 없어요. 숫자는 아래 표에서 볼 수 있어요.
        </p>
      ) : null}
      {done && report.summary ? (
        <p className={`text-body-foreground text-base leading-[1.7] ${AI_TEXT}`}>
          {report.summary}
        </p>
      ) : null}
      {done && concepts.length > 0 ? (
        <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2">
          {concepts.map((concept) => (
            <li key={concept.slug} className="bg-muted flex min-w-0 flex-col gap-3 rounded-lg p-5">
              <h3 className="text-foreground flex items-center gap-2 text-base font-bold">
                {concept.name}
                <Badge tone="warning">취약</Badge>
              </h3>
              <dl className="m-0 flex flex-col gap-3">
                {concept.explanation ? (
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground text-[13px] font-semibold">
                      무엇이 어려웠나요
                    </dt>
                    <dd
                      className={`text-body-foreground m-0 text-[15px] leading-[1.65] ${AI_TEXT}`}
                    >
                      {concept.explanation}
                    </dd>
                  </div>
                ) : null}
                {concept.practice ? (
                  <div className="flex flex-col gap-1">
                    <dt className="text-muted-foreground text-[13px] font-semibold">
                      이렇게 연습해 보세요
                    </dt>
                    <dd
                      className={`text-body-foreground m-0 text-[15px] leading-[1.65] ${AI_TEXT}`}
                    >
                      {concept.practice}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
