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
  retry: { language: Language; code: string }
}

/**
 * [다시 풀기]가 풀이 화면에 넘기는 제출 코드.
 *
 * 제출하면 저장본이 지워지므로(forgetSubmittedCode) 이 버튼들만 코드를 들고 간다. 저장소에
 * 다시 쓰지 않는다. 쓰면 손대지 않고 나갔다 들어와도 제출한 코드가 또 열린다.
 * 채점 중에는 코드가 null이라 넘길 것이 없다.
 */
export function retryState(
  language: Language,
  code: string | null | undefined,
): RetryState | undefined {
  return typeof code === 'string' ? { retry: { language, code } } : undefined
}

/** 이동 state에서 꺼낸 제출 코드. state는 브라우저 기록에서 오므로 모양을 확인한다. */
export function retriedCode(state: unknown): RetryState['retry'] | null {
  const retry = (state as Partial<RetryState> | null)?.retry
  return typeof retry?.code === 'string' && typeof retry.language === 'string' ? retry : null
}

/** 주소에서 받은 언어. 아는 값이고 그 문제가 지원할 때만 돌려준다 — 주소는 손으로 고친다. */
export function askedLanguage(
  raw: string | null,
  supported: readonly { language: Language }[],
): Language | null {
  return supported.some((it) => it.language === raw) ? (raw as Language) : null
}
