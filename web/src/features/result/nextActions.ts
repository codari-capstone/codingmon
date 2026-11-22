import type { SubmissionResult } from '@/api/types'
import { type RetryState, retryState, solvePath } from '@/features/solve/solvePath'

export interface NextAction {
  label: string
  /** 눌렀을 때 갈 곳 */
  to: string
  /** 풀이 화면에 들고 갈 제출 코드 */
  state?: RetryState
}

/**
 * 판정에 따른 다음 행동 (RES-07).
 *
 * 정답이면 [다음 문제], 오답이면 [다시 풀기]다. 오답의 [AI 분석]과 정답의 [AI 리뷰]는 이 목록이
 * 아니라 AI 패널(`AnalysisPanel`·`CodeReviewPanel`)의 버튼이다 — 이동이 아니라 그 자리에서
 * 결과를 받기 때문이다. `ACCEPTED`가 아닌 판정은 모두 오답으로 본다 — 출력 형식이 틀린 것도
 * 다시 풀어야 하는 것은 같다.
 *
 * [다음 문제]는 문제 목록으로 간다. 다음 문제 추천(#44)은 리포트 안의 서버 함수라 이 화면에서
 * 부를 API가 없다.
 *
 * 채점 불가는 서버 문제라 판정이 없다(계약: `verdict`가 null이고 시도 횟수에 넣지
 * 않는다). 다시 제출할 길만 준다 — 안내 문구는 `VERDICT_INFO.JUDGE_ERROR`가 가진다.
 *
 * 제출하면 브라우저 저장본이 지워지므로(SOLVE-11) 두 버튼은 제출한 코드를 들고 간다.
 *
 * 채점이 끝나지 않았으면 빈 배열이다 — 채점 중에 [다시 풀기]를 누르면 방금 보낸 제출의
 * 결과를 못 보게 된다.
 */
export function nextActions(result: SubmissionResult, userId: number | undefined): NextAction[] {
  const retry = {
    to: solvePath(result.problemId, result.language),
    state: retryState(userId, result.language, result.sourceCode),
  }
  if (result.status === 'JUDGE_ERROR') {
    // [다시 풀기]와 같은 주소를 쓴다. 직접 조립했더니 언어가 빠져, C++로 제출했다가
    // 채점 불가를 받은 사람이 Python 자리로 돌아갔다 — solvePath를 둔 이유가 이것이다.
    return [{ label: '다시 제출하기', ...retry }]
  }
  if (result.verdict === null) return []

  if (result.verdict === 'ACCEPTED') {
    return [{ label: '다음 문제', to: '/problems' }]
  }

  // 결과 화면의 제목 링크와 같은 주소를 쓴다 (solvePath).
  return [{ label: '다시 풀기', ...retry }]
}
