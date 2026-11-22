import type { Language } from '@/api/types'

/**
 * 풀이 화면 주소.
 *
 * 언어를 담는다. 없으면 풀이 화면이 첫 언어(PYTHON)를 열어서, C++로 제출한 사람이
 * 저장해 둔 C++ 코드가 아니라 Python 자리를 보게 된다(SolvePage 주석).
 *
 * 결과 화면의 제목 링크와 [다시 풀기]가 **같은 곳으로 가야 한다**. 두 곳에서 문자열을
 * 따로 조립했더니, 쿼리 이름이나 경로를 바꿀 때 한쪽만 고치면 서로 다른 화면을 여는
 * 모양이 됐다.
 */
export function solvePath(problemId: number, language: Language): string {
  return `/problems/${problemId}?language=${language}`
}

export interface RetryState {
  retry: { userId: number; submissionId: number; language: Language }
}

/**
 * [다시 풀기]가 풀이 화면에 넘기는 제출 번호. 풀이 화면이 이 번호로 제출 코드를 받는다.
 *
 * 판정이 나면 저장본이 지워지므로(forgetJudgedCode) 이 버튼들만 제출 코드를 다시 연다. 저장소에
 * 다시 쓰지 않는다. 쓰면 손대지 않고 나갔다 들어와도 제출한 코드가 또 열린다.
 *
 * **코드 원문을 담지 않는다.** state는 로그아웃·탈퇴해도 탭의 방문 기록에 남아 지울 수 없다(MY-04).
 * 주인도 함께 담아, 같은 탭에서 로그인한 다음 사람의 뒤로 가기로는 조회하지 않는다.
 */
export function retryState(
  userId: number | undefined,
  submissionId: number,
  language: Language,
): RetryState | undefined {
  return userId !== undefined ? { retry: { userId, submissionId, language } } : undefined
}

/** 이 사용자의 제출 번호만 꺼낸다. state는 브라우저 기록에서 오므로 모양을 확인한다. */
export function retriedSubmission(
  state: unknown,
  userId: number | undefined,
): RetryState['retry'] | null {
  const retry = (state as Partial<RetryState> | null)?.retry
  return retry?.userId === userId &&
    userId !== undefined &&
    typeof retry?.submissionId === 'number' &&
    typeof retry.language === 'string'
    ? retry
    : null
}

/**
 * 제출하는 방문 기록 항목의 제출 코드를 비우고, 접수가 실패하면 되돌릴 함수를 준다.
 * 다시 제출한 뒤 뒤로 가기로 그 전 코드가 열리지 않게 한다.
 *
 * 응답을 기다리는 사이 화면을 옮길 수 있어 제출을 누른 때 비운다. 되돌릴 때도 그 항목일 때만 쓴다.
 * 제출 뒤 이동과 겹치면 앞의 이동이 취소되므로 라우터의 replace를 쓰지 않는다.
 */
export function holdRetryState(): () => void {
  const entry = window.history.state as {
    key?: string
    usr?: Partial<RetryState> | null
  } | null
  if (!entry?.usr?.retry) return () => {}
  window.history.replaceState({ ...entry, usr: undefined }, '')
  return () => {
    const now = window.history.state as { key?: string } | null
    if (now?.key === entry.key) window.history.replaceState(entry, '')
  }
}

/** 주소에서 받은 언어. 아는 값이고 그 문제가 지원할 때만 돌려준다 — 주소는 손으로 고친다. */
export function askedLanguage(
  raw: string | null,
  supported: readonly { language: Language }[],
): Language | null {
  return supported.some((it) => it.language === raw) ? (raw as Language) : null
}
