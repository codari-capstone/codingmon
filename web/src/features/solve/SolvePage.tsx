import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useParams, useSearchParams } from 'react-router'

import type { Language, ProblemDetailView } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { Badge } from '@/components/ui/badge'
import { LoadingState } from '@/components/LoadingState'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { useAuth } from '@/features/auth/useAuth'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { submissionResultQuery } from '@/features/result/resultQuery'
import { parsePathId } from '@/lib/pathId'
import { BeginnerGuide } from './BeginnerGuide'
import { CodeEditor } from './CodeEditor'
import { getEditorSettings } from './editorSettings'
import { LanguagePicker } from './LanguagePicker'
import { formatTimeLimit, LANGUAGE_LABEL } from './labels'
import { ReportProblem } from './ReportProblem'
import { RunButton, SampleRun } from './SampleRun'
import { useSampleRun } from './sampleRunQuery'
import { Samples } from './Samples'
import {
  forgetProblemDrafts,
  openCodeView,
  readDraftCode,
  readMissedRetryCode,
  readSavedCode,
  showViewedCode,
  storeSavedCode,
} from './savedCode'
import { askedLanguage, retriedSubmission } from './solvePath'
import { problemDetailQuery } from './solveQuery'
import { StarterCodeButton } from './StarterCodeButton'
import { useSubmit } from './submitQuery'
import { SubmitButton, SubmitError } from './SubmitButton'
import { Statement } from './Statement'
import { useWideLayout } from './useWideLayout'

/**
 * 제목·난이도·태그·제한 (SOLVE-01).
 *
 * 디자인 화면에는 '문제 목록 > N. 제목' 경로가 있지만 넣지 않는다. Breadcrumb 부품 규칙이
 * "두 단계뿐인 화면에는 쓰지 않는다"이고, 마지막 항목이 바로 아래 h1과 같아 화면 낭독기가
 * 같은 제목을 두 번 읽는다(#266 리뷰). 목록으로는 상단 바의 '문제'로 간다.
 */
function Header({
  problem,
  current,
}: {
  problem: ProblemDetailView
  current: ProblemDetailView['languages'][number] | undefined
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {/* 디자인처럼 제목 줄 오른쪽에 [문제 신고] (SOLVE-12) */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h1 className="page-title">{problem.title}</h1>
        <ReportProblem problem={problem} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="outline">{DIFFICULTY_LABEL[problem.difficulty]}</Badge>
        {problem.tags.map((tag) => (
          <Badge key={tag.slug}>{tag.name}</Badge>
        ))}
        {current ? (
          // 제한은 고른 언어의 것이다 (SOLVE-04). Python이 C++보다 느려 제한이 다르다.
          // 한 문자열로 둔다 — 조각으로 나누면 텍스트 노드가 쪼개져 "Python · 2초 · 256MB"를
          // 한 덩어리로 찾는 테스트가 못 찾는다.
          <span className="text-muted-foreground text-sm">{`${LANGUAGE_LABEL[current.language]} · ${formatTimeLimit(current.timeLimitMs)} · ${current.memoryLimitMb}MB`}</span>
        ) : null}
      </div>
    </div>
  )
}

/**
 * 문제를 받은 뒤의 화면 (SOLVE-01~07·10·11).
 *
 * 상태를 들고 있는 쪽을 조기 반환 아래로 내렸다. 훅은 조기 반환보다 위에 있어야 하므로
 * 한 컴포넌트에 두면 `language`가 정해진 뒤에는 메모를 걸 수 없다 — 저장된 코드를
 * 언어가 바뀔 때만 읽으려면 이 자리가 필요하다.
 */
function Workspace({
  problem,
  retried,
  missedRetry,
  onAccepted,
}: {
  problem: ProblemDetailView
  /** [다시 풀기]로 넘겨받은 제출의 코드 */
  retried: { language: Language; code: string } | null
  /** 코드를 받지 못한 [다시 풀기] 제출. 이 언어에서는 다른 제출의 판정 대기 코드를 열지 않는다. */
  missedRetry: { language: Language; submissionId: number } | null
  /** 제출이 접수됐다. 이 뒤의 이동은 '작성하다 떠남'이 아니다. */
  onAccepted: () => void
}) {
  const wide = useWideLayout()
  const { user } = useAuth()
  // 반응형 분기 **바깥**에서 부른다. 안에서 부르면 폭이 64rem을 넘나들 때 진행 중인
  // 제출을 잃는다 (submitQuery 주석).
  const submit = useSubmit(onAccepted)
  // 같은 이유로 여기서 부른다 — 폭이 바뀌면 실행 번호가 사라져 결과를 영영 못 본다.
  const sampleRun = useSampleRun()
  /**
   * 고른 언어는 **주소가 들고 있다** (`?language=`).
   *
   * 결과 화면의 [다시 풀기]가 제출한 언어를 담아 보낸다(solvePath). 처음에는 그 값을
   * 첫 렌더에 한 번만 읽어 state로 옮겼는데, 그러면 화면에서 언어를 바꿔도 주소는 그대로라
   * 새로고침하면 쓰던 언어가 아닌 쪽이 열린다. 주소를 진실로 두면 그 어긋남이 없다.
   *
   * `replace`로 쓴다 — 언어를 몇 번 바꿨다고 뒤로 가기가 그만큼 쌓이면 안 된다.
   */
  const [searchParams, setSearchParams] = useSearchParams()
  const chosen = askedLanguage(searchParams.get('language'), problem.languages)
  const setChosen = (next: Language) =>
    setSearchParams(
      (prev) => {
        // 받은 것을 고쳐 그대로 돌려주면 주소가 바뀌지 않는다 — 라디오를 눌러도 아무
        // 일이 없었다(e2e가 "체크 상태가 바뀌지 않았다"로 잡았다). 새 객체를 만든다.
        const next_ = new URLSearchParams(prev)
        next_.set('language', next)
        return next_
      },
      { replace: true, preventScrollReset: true },
    )
  // 언어별로 따로 들고 있는다. C++로 갔다 돌아왔을 때 Python 코드가 그대로 있어야 한다.
  // [다시 풀기]로 왔으면 그 제출 코드로 시작한다. 이미 고친 저장본이 있으면 그쪽이 더 새 코드다.
  const [codeByLanguage, setCodeByLanguage] = useState<Partial<Record<Language, string>>>(() =>
    retried && readDraftCode(user?.id, problem.id, retried.language) === null
      ? { [retried.language]: retried.code }
      : {},
  )
  // 밖에서 코드를 갈아끼운 횟수. 에디터 key에 들어간다 — 아래 CodeEditor 주석.
  const [generation, setGeneration] = useState(0)
  // 첫 화면의 판단을 고정한다. 나중에 조회가 성공해도 쓰던 에디터의 시작점이 바뀌면 안 된다
  const [missed] = useState(missedRetry)

  /**
   * 지금 언어. 고른 것이 지원 목록에 없으면 첫 언어로 돌아간다.
   *
   * `chosen`을 그대로 믿으면, 다시 받은 데이터에서 그 언어가 빠졌을 때 `current`가
   * undefined가 되어 에디터와 **언어 선택이 함께** 사라진다. 그러면 사용자는
   * 새로고침하지 않고는 지원되는 언어로 돌아갈 길이 없다. 계약은 PYTHON, CPP 순서를
   * 보장하므로 첫 언어가 기본값이다.
   *
   * 주소에 언어가 없으면 화면 설정의 기본 언어(UX-07)를 먼저 찾는다. '먼저 여는 언어'라
   * 화면을 열 때 한 번만 읽는다 — 다른 탭에서 바꿨다고 쓰던 에디터가 갈아끼워지면 안 된다.
   */
  const [preferred] = useState(() => getEditorSettings().language)
  const current =
    problem.languages.find((it) => it.language === (chosen ?? preferred)) ??
    problem.languages[0] ??
    undefined
  const language = current?.language

  /**
   * 이 언어를 처음 열 때 들어갈 코드 (SOLVE-11 → SOLVE-06).
   *
   * 저장된 것이 있으면 그것, 없으면 시작 코드다. 렌더마다 읽지 않도록 언어로 묶는다 —
   * 읽기가 싼 작업이어도 렌더 안에서 저장소를 건드리는 모양을 남기지 않는다.
   */
  const opening = useMemo(
    () =>
      language && current
        ? ((language === missed?.language
            ? readMissedRetryCode(user?.id, problem.id, language, missed.submissionId)
            : readSavedCode(user?.id, problem.id, language)) ?? current.starterCode)
        : '',
    [user?.id, problem.id, language, current, missed],
  )

  const code = language ? (codeByLanguage[language] ?? opening) : ''

  // 좁은 화면의 에디터는 지문 탭 뒤에 숨은 채 마운트돼 있다. 보이는 동안만 '본 코드'로 친다
  const [tab, setTab] = useState('statement')
  const editorVisible = wide || tab === 'editor'
  useEffect(() => {
    if (!language || !editorVisible) return undefined
    return openCodeView(user?.id, problem.id, language)
  }, [editorVisible, user?.id, problem.id, language])
  // 위 effect 뒤에 돌아야 한다. 입력마다 화면을 새로 열면 이 화면에서 본 요청을 잊는다
  useEffect(() => {
    if (language && editorVisible) showViewedCode(code)
  }, [editorVisible, user?.id, problem.id, language, code])

  const editor =
    language && current ? (
      <div className="flex flex-col gap-4">
        <div className="bg-card flex flex-col gap-4 rounded-lg border p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LanguagePicker
              // 언어 목록이 바뀌면 새로 그린다. 새로 생긴 칸은 고른 표시를 단 채 들어와 알약이 따라가지 못한다
              key={problem.languages.map(({ language }) => language).join()}
              languages={problem.languages}
              value={language}
              onChange={(next) => setChosen(next)}
            />
            <StarterCodeButton
              starterCode={current.starterCode}
              code={code}
              onLoad={() => {
                setCodeByLanguage((prev) => ({ ...prev, [language]: current.starterCode }))
                // 저장도 함께 지운다. 안 하면 새로고침에 방금 버린 코드가 돌아온다.
                storeSavedCode(user?.id, problem.id, language, current.starterCode)
                setGeneration((it) => it + 1)
              }}
            />
          </div>
          {/*
          한 번도 손대지 않은 언어는 그 언어의 시작 코드로 연다 (SOLVE-06). 계약은
          시작 코드가 없으면 빈 문자열을 준다.

          **에디터에 값을 밀어 넣는 길은 key뿐이다.** @uiw는 타이핑 직후 들어온 외부
          value를 200ms 동안 미뤄 두는데(useCodeMirror의 typingLatch), 그 200ms를
          `setInterval(…, 1)`로 200번 세기 때문에 바쁜 환경에서는 훨씬 늦게 온다.
          글자를 치다 바로 언어를 바꾸거나 시작 코드를 불러오면 전환이 안 보인다 —
          테스트에서 두 번 걸렸다. 밖에서 갈아끼울 때마다 새로 켜면 그 경합이 없다.

          탭 전환에서는 반대로 forceMount로 살려 둔다(아래 TabsContent 주석). 거기서는
          같은 코드를 계속 쓰는 중이라 undo 이력이 자산이고, 여기서는 코드 자체가
          바뀌는 일이라 버리는 것이 맞다 — 그래서 덮어쓰기 전에 확인을 받는다.
        */}
          <CodeEditor
            key={`${language}:${generation}`}
            language={language}
            value={code}
            onChange={(next) => {
              setCodeByLanguage((prev) => ({ ...prev, [language]: next }))
              // shortcut: 입력마다 저장한다. 코드가 수십 KB로 커져 입력이 버벅이면
              // 저장을 늦출 자리는 여기다. 지금은 잃는 글자가 없는 쪽을 택한다.
              storeSavedCode(user?.id, problem.id, language, next)
            }}
          />
          {/*
          [실행]·[제출하기]는 같은 크기(128px 두 칸)로 두고 무게는 variant로만 나눈다.
          파란 버튼은 이 영역에 제출 하나다. 좁은 폭(sm 미만)은 128px 둘이 카드에 들어가지 않아 반씩 나눈다.
        */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {problem.samples.length > 0 ? (
              <p className="text-muted-foreground text-sm">
                실행은 공개 예제로만 돌려요. 시도 횟수에 들어가지 않아요.
              </p>
            ) : null}
            <div className="grid w-full auto-cols-fr grid-flow-col gap-2.5 sm:ml-auto sm:w-auto sm:auto-cols-[128px]">
              <RunButton
                run={sampleRun}
                samples={problem.samples}
                problemId={problem.id}
                language={language}
                code={code}
              />
              <SubmitButton
                submit={submit}
                problemId={problem.id}
                language={language}
                code={code}
              />
            </div>
          </div>
          <SubmitError submit={submit} language={language} code={code} />
        </div>
        <SampleRun run={sampleRun} samples={problem.samples} />
        <BeginnerGuide language={language} />
      </div>
    ) : null

  const statement = (
    <article className="bg-card text-body-foreground flex min-w-0 flex-col gap-8 rounded-lg border p-6 text-base leading-[1.7] sm:p-8">
      <Statement problem={problem} />
      <Samples samples={problem.samples} />
    </article>
  )

  return (
    <section className="flex flex-col gap-6">
      <Header problem={problem} current={current} />

      {/* 넓은 화면은 좌우 분할, 좁은 화면은 탭 전환 (SOLVE-10). 가르는 이유는 useWideLayout 주석 */}
      {wide ? (
        // 지문:에디터 = 2:3. 코드는 가로로 길어지고 지문은 글이라 좁아도 읽힌다(#327).
        // 분할이 막 켜지는 1024px 부근은 2:3이면 지문 속 예제 칸이 너무 좁아 xl부터만 쓴다(#330 리뷰)
        <div className="grid grid-cols-2 items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          {statement}
          {/*
            에디터 칸을 화면에 붙여 둔다. 지문은 에디터보다 훨씬 길어서(측정: 1280px
            화면에서 지문 1271px, 에디터 칸 492px) 지문을 읽으려고 내리면 에디터가
            화면 밖으로 사라진다. 좌우 분할(SOLVE-10)은 둘을 같이 쓰라는 배치다.

            상단바는 sticky가 아니라 함께 올라가므로 top은 여백만 띄운다.
            AppShell이 사이드바를 sticky로 두지 않는 이유(좁아지면 위로 쌓인다)는
            여기 걸리지 않는다 — 좁은 화면은 아예 다른 트리(탭)다.

            입문자 안내를 펼치거나 화면이 낮으면 칸이 뷰포트보다 길어질 수 있어
            그때는 칸 안에서 스크롤한다.
          */}
          <div className="sticky top-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">{editor}</div>
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          {/*
            받은 부품의 기본 높이는 리스트 32px·트리거 25px이다. 좁은 화면에서 지문↔코드
            전환은 이 탭뿐이라 프로젝트 공통 터치 영역(44px)을 리스트와 트리거 양쪽에
            건다 — 리스트에만 걸면 줄만 높아지고 누를 수 있는 영역은 그대로다
            (ProblemFilters.tsx의 같은 주석).
            aria-label은 SOLVE-07 안내·AI 힌트 탭이 같은 화면에 들어올 때를 대비한다.
          */}
          <TabsList aria-label="문제 풀이 영역" className="min-h-11">
            <TabsTrigger value="statement" className="min-h-11">
              지문
            </TabsTrigger>
            <TabsTrigger value="editor" className="min-h-11">
              코드 작성
            </TabsTrigger>
          </TabsList>
          <TabsContent value="statement">{statement}</TabsContent>
          {/*
            forceMount가 있어야 에디터가 탭을 옮겨도 살아 있다 — 없으면 Radix가 비활성
            패널을 언마운트해서 undo 이력·커서·스크롤이 매번 사라진다. forceMount를 켜면
            Radix는 `hidden`을 걸지 않으므로(present가 늘 true다) 숨기는 쪽은 우리가 건다.
            1차에서 막혔던 preflight의 `display:none !important`는 `hidden`을 되살릴 때만
            걸리는 벽이고, 여기는 반대 방향이라 Tailwind `hidden`으로 충분하다.
            지문 쪽은 켜지 않는다 — 살릴 상태가 없고, 양쪽을 켜면 jsdom에서 같은 제목이
            둘이 되어 단위 테스트가 가리킬 곳을 잃는다.
          */}
          <TabsContent value="editor" forceMount className="data-[state=inactive]:hidden">
            {editor}
          </TabsContent>
        </Tabs>
      )}
    </section>
  )
}

/** 문제 풀이 (SOLVE-01~07·10·11). 주소를 읽어 문제별 화면을 연다. */
export function Component() {
  const params = useParams()
  const problemId = parsePathId(params.id)
  // 주소를 손으로 고친 경우다. 요청을 보내지 않고 없는 문제와 같은 문구로 끝낸다
  // (parsePathId 주석). 화면 전체가 오류이므로 그 제목이 h1이다.
  if (problemId === null) return <ErrorState problem={{ status: 404 }} headingLevel={1} />
  // key로 문제를 묶는다. 다른 문제로 옮기는 것도 이 문제의 화면을 떠나는 것이다.
  return <SolveProblem key={problemId} problemId={problemId} />
}

/** 문제 하나의 풀이 화면. 문제를 받아 Workspace에 넘기고, 떠날 때 작성 중 코드를 지운다. */
function SolveProblem({ problemId }: { problemId: number }) {
  const { data, isPending, error, refetch } = useQuery(problemDetailQuery(problemId))
  // [다시 풀기]로 왔으면 제출 코드를 받은 뒤에 에디터를 연다. 못 받으면 시작 코드로 연다.
  // 저장본이 있으면 그쪽을 열므로 받지 않는다.
  const { user } = useAuth()
  const userId = user?.id
  const { state } = useLocation()
  // 처음 들어올 때 한 번만 읽는다. 언어를 바꾸면 주소가 state 없이 바뀌어, 매번 읽으면 조회가 꺼진 채 로딩에 갇힌다
  const [retry] = useState(() => retriedSubmission(state, userId))
  const [needsSubmission] = useState(
    () => retry !== null && readDraftCode(userId, problemId, retry.language) === null,
  )
  const submission = useQuery({
    ...submissionResultQuery(retry?.submissionId ?? 0),
    enabled: needsSubmission,
  })

  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, submission.error)
  }, [queryClient, submission.error])

  /**
   * 화면을 떠나면 작성 중 코드를 지운다 (SOLVE-11).
   *
   * Workspace가 아니라 여기서 본다. 재조회 실패로 같은 주소에서 오류 화면으로 바뀌면 Workspace만
   * 내려가는데, 그때 지우면 [다시 시도]가 쓰던 코드를 잃는다.
   *
   * 지우기를 한 박자 늦춘다. StrictMode는 마운트 직후 cleanup과 setup을 다시 돌리는데, 바로
   * 지우면 쓰던 코드가 사라진다. 제출로 떠나면 판정이 날 때까지 남기고, 세션이 끊겨 떠나면
   * 다시 로그인해 이어 쓰도록 남긴다.
   */
  const accepted = useRef(false)
  const leaving = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearTimeout(leaving.current)
    return () => {
      leaving.current = window.setTimeout(() => {
        if (!accepted.current && queryClient.getQueryData(ME_QUERY_KEY)) {
          forgetProblemDrafts(userId, problemId)
        }
      }, 0)
    }
  }, [queryClient, userId, problemId])

  if (error) {
    return <ErrorState problem={error} headingLevel={1} onRetry={() => void refetch()} />
  }
  // 제목을 아직 모르지만 제목 없는 화면을 두지 않는다. 스크린 리더의 제목 탐색으로
  // 잡을 것이 있어야 한다 (ProblemListPage는 h1을 늘 띄워 두고 그 아래를 갈아끼운다).
  if (isPending || !data || (needsSubmission && submission.isPending)) {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="page-title">문제 풀이</h1>
        <LoadingState />
      </section>
    )
  }

  // 주소의 문제와 다른 제출이면 쓰지 않는다. 다른 문제의 코드가 이 문제 에디터에 열린다
  const submitted = submission.data
  const retried =
    retry &&
    submitted?.problemId === data.id &&
    submitted.language === retry.language &&
    typeof submitted.sourceCode === 'string'
      ? { language: submitted.language, code: submitted.sourceCode }
      : null

  // key로 문제를 묶는다. 캐시가 있어 isPending을 거치지 않고 다른 문제로 넘어가면 같은
  // 인스턴스가 재사용돼, 이전 문제의 codeByLanguage가 새 문제의 저장본보다 우선하고
  // 다음 입력에서 새 문제의 저장소를 이전 코드로 덮어쓴다.
  return (
    <Workspace
      key={data.id}
      problem={data}
      retried={retried}
      missedRetry={needsSubmission && !retried ? retry : null}
      onAccepted={() => {
        accepted.current = true
      }}
    />
  )
}
