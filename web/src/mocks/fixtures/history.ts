import type { ProblemHistory, SubmissionResult, SubmissionSummary } from '@/api/types'

/**
 * 제출 기록 목 데이터 (HIST-01·02).
 *
 * 23문제로 두 페이지가 나오게 한다(페이지당 20). 앞의 셋은 손으로 적어 맞힘·못 맞힘·힌트를
 * 쓴 경우를 모두 보게 하고, 나머지는 채운다. 제출은 문제마다 3개로 판정과 언어를 돌려 쓴다.
 */
const handWritten: ProblemHistory[] = [
  {
    problemId: 3,
    title: '역방향 피라미드',
    difficulty: 'EASY',
    solved: true,
    attemptCount: 3,
    maxRevealedHintLevel: 2,
  },
  {
    problemId: 2,
    title: '구간 합 구하기',
    difficulty: 'MEDIUM',
    solved: false,
    attemptCount: 5,
    maxRevealedHintLevel: 3,
  },
  {
    problemId: 1,
    title: 'A+B',
    difficulty: 'EASY',
    solved: true,
    attemptCount: 1,
    maxRevealedHintLevel: 0,
  },
]

const filler: ProblemHistory[] = Array.from({ length: 20 }, (_, i) => ({
  problemId: 100 + i,
  title: `연습 문제 ${i + 1}`,
  difficulty: (['EASY', 'MEDIUM', 'HARD'] as const)[i % 3],
  solved: i % 2 === 0,
  attemptCount: (i % 4) + 1,
  maxRevealedHintLevel: i % 4,
}))

/** 마지막으로 제출한 순. */
export const problemHistories: ProblemHistory[] = [...handWritten, ...filler]

/** 맞힌 문제는 가장 오래된 제출이 정답이고, 못 맞힌 문제에는 정답이 없다. */
const SOLVED_VERDICTS = ['WRONG_ANSWER', 'RUNTIME_ERROR', 'ACCEPTED'] as const
const UNSOLVED_VERDICTS = ['WRONG_ANSWER', 'RUNTIME_ERROR', 'TIME_LIMIT_EXCEEDED'] as const

/**
 * 한 문제의 제출 목록, 최신순. 맨 위는 채점 불가 제출 하나다 — 판정 없이 시간·메모리가
 * 비는 줄을 화면이 어떻게 그리는지 보려는 것이다. 판정은 문제별 기록의 `solved`와 맞춘다.
 */
export function submissionsOf(problemId: number): SubmissionSummary[] {
  const solved = problemHistories.find((item) => item.problemId === problemId)?.solved
  const VERDICTS = solved ? SOLVED_VERDICTS : UNSOLVED_VERDICTS
  const base = problemId * 10
  const judged = VERDICTS.map((verdict, i): SubmissionSummary => ({
    id: base + (VERDICTS.length - i),
    language: i % 2 === 0 ? 'PYTHON' : 'CPP',
    status: 'COMPLETED',
    verdict,
    executionTimeMs: 100 + i * 20,
    memoryUsedKb: 30_000 + i * 1_000,
    submittedAt: new Date(Date.UTC(2026, 10, 3, 12 - i)).toISOString(),
  }))
  const judgeError: SubmissionSummary = {
    id: base + VERDICTS.length + 1,
    language: 'PYTHON',
    status: 'JUDGE_ERROR',
    verdict: null,
    executionTimeMs: null,
    memoryUsedKb: null,
    submittedAt: new Date(Date.UTC(2026, 10, 3, 13)).toISOString(),
  }
  return [judgeError, ...judged]
}

/**
 * 제출 하나의 결과 (HIST-02). 제출 번호는 `submissionsOf`의 `문제 번호 × 10 + 순번`이라 번호에서
 * 문제를 거꾸로 알아낸다. 없는 번호는 null이다.
 *
 * 코드에 `<`와 `&`를 일부러 넣었다 — 글자 그대로 보여야 하는 값이다(계약).
 */
export function pastSubmission(id: number): SubmissionResult | null {
  const problemId = Math.floor(id / 10)
  const summary = submissionsOf(problemId).find((item) => item.id === id)
  const history = problemHistories.find((item) => item.problemId === problemId)
  if (!summary || !history) return null

  const runtime = summary.verdict === 'RUNTIME_ERROR'
  return {
    id,
    problemId,
    problemTitle: history.title,
    language: summary.language,
    sourceCode:
      summary.language === 'PYTHON'
        ? 'n = int(input())\nfor i in range(n):\n    if i < n & 1:\n        print("*" * i)\n'
        : '#include <iostream>\nint main() {\n  int n;\n  std::cin >> n;\n  return 0;\n}\n',
    status: summary.status,
    progress: 100,
    verdict: summary.verdict,
    runtimeErrorType: runtime ? 'INDEX_ERROR' : null,
    runtimeErrorMessage: runtime ? 'IndexError: list index out of range (line 3)' : null,
    compilerMessage: null,
    executionTimeMs: summary.executionTimeMs,
    memoryUsedKb: summary.memoryUsedKb,
    submittedAt: summary.submittedAt,
    judgedAt: summary.submittedAt,
    unlockedBadges: [],
  }
}
