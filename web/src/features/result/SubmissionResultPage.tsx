import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'

import type { Language, SubmissionResult } from '@/api/types'
import errorScene from '@/assets/scenes/error.png'
import successScene from '@/assets/scenes/success.png'
import { ErrorState } from '@/components/ErrorState'
import { Raw } from '@/components/Raw'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Verdict } from '@/components/Verdict'
import { Badge } from '@/components/ui/badge'
import { CodeBlock } from '@/components/ui/code-block'
import { Button } from '@/components/ui/button'
import { RUNTIME_ERROR_INFO, STATUS_LABEL, VERDICT_INFO } from '@/constants/verdicts'
import { LANGUAGE_LABEL } from '@/features/solve/labels'
import { solvePath } from '@/features/solve/solvePath'
import { AnalysisPanel } from '@/features/ai/AnalysisPanel'
import { analysisQuery } from '@/features/ai/analysisQuery'
import { CodeReviewPanel } from '@/features/ai/CodeReviewPanel'
import { suspectLines } from '@/features/ai/countLines'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { parsePathId } from '@/lib/pathId'
import { BLANK_PIXEL } from '@/lib/utils'
import { nextActions } from './nextActions'
import { problemSubmissionsPath } from '@/features/history/historyPath'
import { isDeadEnd, isFinished, submissionResultQuery } from './resultQuery'

/**
 * 지금 무슨 일이 일어나고 있는지 한 줄 (RES-01·02·05).
 *
 * **진행 문구와 판정이 같은 live region을 쓴다.** 처음에는 진행만 `role="status"`로 두고
 * 판정은 일반 문단에 그렸더니, 끝나는 순간 live region이 통째로 사라져 **가장 중요한
 * 마지막 변화인 판정이 안내되지 않았다.** 화면을 보지 않는 사용자는 '채점 중 60%'까지
 * 듣고는 결과를 직접 찾아다녀야 했다.
 *
 * 그래서 **래퍼의 종류도 분기마다 바꾸지 않는다.** 컴파일 에러일 때만 `div`를 쓰고 그
 * 밖에는 `p`를 썼더니, 상태가 COMPILING에서 COMPILE_ERROR로 넘어갈 때 React가 live
 * region 노드를 지우고 새로 붙였다 — 내용을 이미 담은 채 새로 붙은 live region은 스크린
 * 리더가 읽지 않는 경우가 많아, 같은 문제가 컴파일 에러에서만 되살아났다. 늘 같은
 * `div`를 두고 그 안의 내용만 바꾼다.
 */
function Headline({ result }: { result: SubmissionResult }) {
  const { status, progress, verdict, compilerMessage } = result
  // 채점 불가는 판정이 아니라 상태다(계약). 화면에서는 같은 자리에 나온다.
  const key = status === 'JUDGE_ERROR' ? 'JUDGE_ERROR' : verdict

  /*
    컴파일 에러는 판정 자체가 펼치는 자리다 — 설명이 "결과를 누르면 … 메시지를 볼 수
    있어요"라고 약속하기 때문이다(AI_FEATURES 10절). 접히는 것은 메시지뿐이고, 설명과
    제출 정보는 아래에 늘 보인다.

    판정도 함께 본다. 계약은 `compilerMessage`를 "COMPILE_ERROR일 때" 있다고만 적고
    `runtimeErrorType`처럼 "일 때만"이라고 하지 않아서, 메시지만 보고 가르면 서버가
    다른 판정에 컴파일 경고를 실어 보낼 때 '맞았습니다!!'가 접히는 토글이 된다.

    live region 안에 두므로 펼칠 때 메시지가 함께 안내될 수 있다. 사용자가 직접 연
    것이라 그대로 둔다 — 판정이 안내되지 않는 쪽이 훨씬 나쁘다.
  */
  const foldable = verdict === 'COMPILE_ERROR' && compilerMessage !== null

  return (
    <div role="status">
      {key === null ? (
        <p className="text-muted-foreground text-sm">
          {/* 진행률은 채점 중일 때만 뜻이 있다. 다른 상태의 0%는 "아직 시작도 안 했다"로 읽혀 오해를 준다 */}
          {status === 'RUNNING' ? `${STATUS_LABEL[status]} ${progress}%` : STATUS_LABEL[status]}
        </p>
      ) : foldable ? (
        <details>
          {/*
            flex를 걸지 않는다. summary의 기본 display가 list-item이라 브라우저가 ▶ 표식을
            그려 주는데, flex로 바꾸면 그 표식이 사라져 펼칠 수 있다는 단서가 마우스를
            올렸을 때의 커서뿐이 된다.
          */}
          <summary className="min-h-11 cursor-pointer py-1">
            {/* summary 자체가 아니라 안쪽 글자만 칠한다. summary를 flex로 바꾸지 않기 위해서다(위 주석) */}
            <Verdict verdict={key} size="lg" />
          </summary>
          <Raw text={compilerMessage ?? ''} className="mt-2" />
        </details>
      ) : (
        <p>
          <Verdict verdict={key} size="lg" />
        </p>
      )}
    </div>
  )
}

/** 언어·시간·메모리. 제출 번호는 판정 위 소제목이 들고 있다. */
function Meta({ result }: { result: SubmissionResult }) {
  const { language, executionTimeMs, memoryUsedKb } = result
  return (
    <div className="flex flex-wrap gap-2">
      <Badge>{LANGUAGE_LABEL[language]}</Badge>
      {/*
        컴파일 에러와 채점 불가는 실행 자체를 못 해 둘 다 null이다(계약). 없는 값을
        '0ms'로 적으면 "아주 빨랐다"로 읽히므로 칩을 아예 뺀다.
      */}
      {executionTimeMs !== null ? <Badge>{executionTimeMs}ms</Badge> : null}
      {memoryUsedKb !== null ? <Badge>{memoryUsedKb.toLocaleString('ko-KR')}KB</Badge> : null}
    </div>
  )
}

/**
 * 쉬운 설명 (RES-03).
 *
 * 판정 이름은 `Headline`이 live region 안에서 띄운다 — 여기서 또 적으면 같은 글자가
 * 두 번 보이고 스크린 리더도 두 번 읽는다.
 */
function Explanation({ result }: { result: SubmissionResult }) {
  const { verdict, status } = result
  // 채점 불가는 판정이 아니라 상태다(계약). 설명은 같은 표에서 가져온다.
  const key = status === 'JUDGE_ERROR' ? 'JUDGE_ERROR' : verdict
  if (key === null) return null

  const info = VERDICT_INFO[key]
  return (
    <div className="flex flex-col gap-3.5">
      <Meta result={result} />
      <p className="text-body-foreground mt-1 text-[17px] leading-[1.65]">{info.description}</p>
      <p className="bg-muted text-body-foreground rounded-[12px] px-[18px] py-3.5 text-[15px] leading-[1.6]">
        {/* 맞혔으면 고칠 것이 없다. 같은 자리에서 다음 걸음을 권한다 */}
        <b className="text-foreground font-semibold">
          {key === 'ACCEPTED' ? '다음으로' : '먼저 확인해 볼 것'}
        </b>{' '}
        · {info.checkFirst}
      </p>
      {verdict === 'RUNTIME_ERROR' ? <RuntimeError result={result} /> : null}
    </div>
  )
}

/**
 * 런타임 에러 종류와 원문 (RES-04).
 *
 * 원문은 **공개 예제에서 난 에러일 때만** 온다(계약: 비공개 테스트에서 났으면 null이고
 * 종류만 보여 준다). 비공개 입력이 섞인 메시지를 보여 주면 테스트 데이터가 새기 때문이라
 * 화면이 없는 원문을 만들어 내서는 안 된다. C++ Segfault처럼 원문 자체가 없는 경우도
 * 같은 null이다.
 */
function RuntimeError({ result }: { result: SubmissionResult }) {
  const { runtimeErrorType, runtimeErrorMessage } = result
  if (runtimeErrorType === null) return null

  const info = RUNTIME_ERROR_INFO[runtimeErrorType]
  return (
    <div className="bg-destructive-soft flex flex-col gap-1.5 rounded-[16px] px-5 py-[18px]">
      <p className="text-destructive-text text-[17px] font-bold">{info.label}</p>
      <p className="text-body-foreground text-[15px] leading-[1.6]">{info.description}</p>
      {runtimeErrorMessage !== null ? (
        <Raw text={runtimeErrorMessage} className="bg-card mt-1.5" />
      ) : null}
    </div>
  )
}

/**
 * 제출한 코드 (HIST-02). 읽기 전용이다.
 *
 * 코드는 채점이 끝난 제출에만 온다(계약). 폴링 중에는 null이라 이 구역 자체가 없다.
 * 글자 그대로 보여 준다 — 학생이 쓴 `<`나 `&`가 해석되면 코드가 달라진다(`Raw`).
 */
function SubmittedCode({ result, suspect }: { result: SubmissionResult; suspect: number[] }) {
  // 계약은 string | null이지만 응답에 필드가 빠진 경우도 막는다. CodeBlock은 없는 코드를 줄로 나누다 깨진다
  if (result.sourceCode === null || result.sourceCode === undefined) return null

  return (
    <section className="flex min-w-0 flex-[1_1_480px] flex-col gap-3">
      <h2 className="text-foreground text-lg font-semibold">제출한 코드</h2>
      {/* CodeBlock은 React가 글자로 넣어 `<`·`&`가 해석되지 않는다(Raw와 같은 보장) */}
      <CodeBlock
        code={result.sourceCode}
        title={FILE_NAME[result.language]}
        lineNumbers
        highlight={suspect}
      />
      {suspect.length > 0 ? (
        <p className="text-muted-foreground text-[13px]">빨간 줄은 AI가 의심한 줄이에요.</p>
      ) : null}
    </section>
  )
}

/** AI 분석은 판정이 난 오답에만 있다(계약: 정답·채점 중·채점 불가는 409). 코드는 끝난 제출에만 온다. */
function canAnalyze(result: SubmissionResult | undefined): boolean {
  return (
    result !== undefined &&
    result.status === 'COMPLETED' &&
    result.verdict !== null &&
    result.verdict !== 'ACCEPTED' &&
    // SubmittedCode와 같은 방어: 필드가 빠진 응답이면 코드 없이 빈 문자열로 분석을 그리게 된다
    typeof result.sourceCode === 'string'
  )
}

/** AI 리뷰는 판정이 난 정답에만 있다(계약: 그 밖은 409). */
function canReview(result: SubmissionResult | undefined): boolean {
  return result?.status === 'COMPLETED' && result.verdict === 'ACCEPTED'
}

const FILE_NAME = { PYTHON: 'solution.py', CPP: 'main.cpp' } satisfies Record<Language, string>

/** 판정 옆 펭귄 장면. 장식이라 alt를 비운다. 채점 중에는 두지 않는다 */
function Scene({ result }: { result: SubmissionResult }) {
  if (!isFinished(result.status)) return null
  const accepted = result.verdict === 'ACCEPTED'
  return (
    // 좁은 화면에서는 뺀다. 판정 아래 그림 한 장이 코드와 AI 분석을 한 화면 넘게 밀어낸다.
    // CSS로 숨기기만 하면 브라우저가 그래도 받으므로, sm 이상에서만 진짜 그림을 고르게 한다(#268 리뷰)
    <picture className="mx-auto hidden flex-none sm:block">
      <source media="(min-width: 40rem)" srcSet={accepted ? successScene : errorScene} />
      <img src={BLANK_PIXEL} alt="" width={210} height={190} className="block h-auto max-w-full" />
    </picture>
  )
}

/** 다음 행동 (RES-06·07)과 이 문제의 제출 기록. 주 동작(primary)은 첫 버튼 하나다. */
function NextActions({ result }: { result: SubmissionResult }) {
  const actions = nextActions(result)
  // 끝난 제출만 기록 목록에 있다(계약). 채점 중에는 갈 곳이 없다.
  const history = isFinished(result.status)
  if (actions.length === 0 && !history) return null

  return (
    <div className="mt-1.5 flex flex-wrap gap-2.5">
      {actions.map((action) =>
        action.to ? (
          <Button key={action.label} asChild className="min-h-11">
            <Link to={action.to}>{action.label}</Link>
          </Button>
        ) : (
          // 못 누르는 이유를 글자로 적는다. 비활성 버튼만 두면 왜 안 되는지 알 길이 없고,
          // 스크린 리더도 "흐리다"는 것까지만 읽는다.
          <Button
            key={action.label}
            variant="secondary"
            className="min-h-11 disabled:text-muted-foreground"
            disabled
          >
            {`${action.label} (준비 중)`}
          </Button>
        ),
      )}
      {history ? (
        <Button asChild variant="secondary" className="min-h-11">
          <Link to={problemSubmissionsPath(result.problemId)}>이 문제의 제출 기록</Link>
        </Button>
      ) : null}
    </div>
  )
}

/** 제출 결과 (RES-01~07). */
export function Component() {
  const params = useParams()
  const submissionId = parsePathId(params.id)
  const { data, isPending, error, refetch } = useQuery({
    ...submissionResultQuery(submissionId ?? 0),
    enabled: submissionId !== null,
  })
  const analyzable = canAnalyze(data)
  // 제출한 코드에 의심 줄을 칠하려고 AI 패널과 같은 쿼리를 읽는다. 같은 키라 요청은 한 번이다
  const { data: analysis } = useQuery({
    ...analysisQuery(submissionId ?? 0),
    enabled: analyzable,
  })
  const shown = analysis?.status === 'COMPLETED' && !analysis.blocked
  const suspect =
    shown && data?.sourceCode ? suspectLines(analysis.suspectLines, data.sourceCode) : []

  /**
   * 세션이 끊겼으면 로그인 화면으로 보낸다 (session.ts).
   *
   * 폴링 중에 만료되는 일이 실제로 생긴다 — 오래 걸리는 채점을 띄워 둔 채 자리를 비우는
   * 경우다. 문구만 띄우면 사용자는 주소를 직접 쳐야 한다. 제출(useSubmit)이 하는 것과
   * 같은 처리이고, mutation이 아니라 query라 effect로 건다.
   */
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  // 주소를 손으로 고친 경우다. 요청을 보내지 않고 없는 제출과 같은 문구로 끝낸다
  // (parsePathId 주석).
  if (submissionId === null) return <ErrorState problem={{ status: 404 }} headingLevel={1} />
  // 오류 화면을 띄우는 때와 폴링을 멈추는 때가 같다 (resultQuery의 isDeadEnd).
  // 그 주석에 세 번 어긋났던 경위를 적어 뒀다.
  if (isDeadEnd(error, data !== undefined)) {
    return <ErrorState problem={error} headingLevel={1} onRetry={() => void refetch()} />
  }
  if (isPending || !data) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="page-title">제출 결과</h1>
        <ListSkeleton rows={3} />
      </section>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        디자인은 판정 글자가 화면의 제목 노릇을 한다. 판정은 live region 안에서 바뀌므로
        h1로 삼지 않고, 화면 제목은 낭독기용으로 둔다. 두 단계 경로 표시는 쓰지 않는다(#266 리뷰).
      */}
      <h1 className="sr-only">제출 결과</h1>

      {/* 판정 카드. 판정 색은 글자에만 쓰고 면은 칠하지 않는다 */}
      <section
        aria-label="채점 결과"
        className="bg-card shadow-card flex flex-wrap items-center gap-8 rounded-[28px] px-6 py-8 sm:px-10 sm:py-9 dark:border"
      >
        <div className="flex min-w-0 flex-[999_1_480px] flex-col gap-3.5">
          <p className="text-eyebrow text-primary-text">
            {/* 다시 풀기와 같은 주소를 쓴다 (solvePath) */}
            <Link to={solvePath(data.problemId, data.language)} className="hover:underline">
              {data.problemTitle}
            </Link>
            {' · '}
            <span>제출 #{data.id}</span>
          </p>
          <Headline result={data} />
          <Explanation result={data} />
          <NextActions result={data} />
        </div>
        <Scene result={data} />
      </section>

      {/* 넓으면 왼쪽 코드, 오른쪽 AI 패널. 좁으면 아래로 쌓는다(UX-05). */}
      <div className="flex flex-wrap items-start gap-5">
        <SubmittedCode result={data} suspect={suspect} />
        {analyzable ? (
          <div className="min-w-0 flex-[1_1_560px]">
            {/*
              key: 제출이 바뀌면 다른 패널이다. 이어 쓰면 진행 중인 요청의 응답이 새 제출의
              캐시에 들어간다(mutation이 마지막 렌더의 onSuccess로 끝나서).
            */}
            <AnalysisPanel
              key={data.id}
              submissionId={data.id}
              sourceCode={data.sourceCode ?? ''}
              retryPath={solvePath(data.problemId, data.language)}
            />
          </div>
        ) : null}
        {canReview(data) ? (
          <div className="min-w-0 flex-[1_1_560px]">
            {/* key는 AnalysisPanel과 같은 이유 */}
            <CodeReviewPanel key={data.id} submissionId={data.id} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
