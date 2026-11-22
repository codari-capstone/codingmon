import type { Language, SubmissionResult } from '@/api/types'

/** 이 기능이 쓰는 모든 키의 앞머리. 로그아웃이 이걸로 골라 지운다. */
const PREFIX = 'solve:'

/**
 * 사용자·문제·언어별 임시 저장 키 (SOLVE-11).
 *
 * **사용자가 키에 들어가야 한다.** 없으면 공용 PC에서 A가 쓴 코드가 B의 에디터에 열리고,
 * B가 한 글자만 쳐도 A의 저장본이 덮어써진다. 로그아웃은 react-query 캐시만 비우므로
 * (useLogout) 저장소는 그 경로로 정리되지 않고, 세션이 조용히 끊긴 경우에는 로그아웃을
 * 거치지도 않는다 — 지우는 것만으로는 부족하고 키가 갈려 있어야 한다.
 *
 * 언어도 키에 들어간다. 같은 문제를 Python으로 쓰다 C++로 바꿔도 각각 남아야 한다.
 *
 * sessionStorage에 둔다. 새로고침에는 남고 탭을 닫으면 사라진다. 화면을 떠날 때는
 * `forgetProblemDrafts`가 지운다.
 */
export function savedCodeKey(userId: number, problemId: number, language: Language): string {
  return `${PREFIX}${userId}:${problemId}:${language}`
}

/**
 * 저장된 코드. 없으면 null.
 *
 * `userId`가 없으면(세션을 아직 모르거나 비로그인) 읽지 않는다. 누구의 것인지 모르는
 * 저장본을 여는 것이 바로 위 주석이 막으려는 유출이다.
 *
 * 사생활 보호 모드나 사이트 데이터가 막힌 브라우저에서는 접근 자체가 던진다 — 그때는
 * 저장이 없던 것으로 보고 시작 코드로 연다 (theme.ts의 readStoredTheme과 같은 처리).
 */
export function readSavedCode(
  userId: number | undefined,
  problemId: number,
  language: Language,
): string | null {
  if (userId === undefined) return null
  try {
    return sessionStorage.getItem(savedCodeKey(userId, problemId, language))
  } catch {
    return null
  }
}

export function storeSavedCode(
  userId: number | undefined,
  problemId: number,
  language: Language,
  code: string,
): void {
  if (userId === undefined) return
  try {
    sessionStorage.setItem(savedCodeKey(userId, problemId, language), code)
  } catch {
    // 저장이 안 되면 이 방문에만 남는다. 화면은 그대로 동작한다. 용량이 찼을 때도
    // 여기로 온다 — 다른 문제의 저장을 지우러 나서지 않는다. 지울 것을 고르는 규칙이
    // 틀리면 사용자가 쓰던 코드를 우리가 지우는 셈이 된다.
  }
}

/**
 * 판정이 난 코드의 저장본을 지운다. 판정이 난 제출은 제출 기록에서 코드를 볼 수 있다.
 *
 * 저장본이 낸 코드와 같을 때만 지운다. 채점을 기다리는 사이 더 친 글자는 제출 기록에 없어서
 * 지우면 되찾을 수 없다. 같은 이유로 다른 언어의 저장본도 건드리지 않는다.
 */
export function forgetSubmittedCode(
  userId: number | undefined,
  problemId: number,
  language: Language,
  submitted: string,
): void {
  if (userId === undefined) return
  try {
    const key = savedCodeKey(userId, problemId, language)
    if (sessionStorage.getItem(key) === submitted) sessionStorage.removeItem(key)
  } catch {
    // 저장소를 못 읽는 브라우저에는 지울 것도 없다.
  }
}

/**
 * 접수된 코드를 판정이 날 때까지 저장본으로 잡아 둔다.
 *
 * [다시 풀기]로 받은 코드를 손대지 않고 내면 저장본이 없다. 그 제출이 채점 불가로 끝나면
 * 제출 기록에도 나오지 않아(계약 getMyProblemHistory) 되찾을 길이 없어진다.
 * 이미 저장본이 있으면 그쪽이 더 새 코드라 덮지 않는다.
 */
export function keepUntilJudged(
  userId: number | undefined,
  problemId: number,
  language: Language,
  code: string,
): void {
  if (readSavedCode(userId, problemId, language) === null) {
    storeSavedCode(userId, problemId, language, code)
  }
}

/** 판정이 났으면 그 코드의 저장본을 지운다. 채점 중과 채점 불가는 남긴다. */
export function forgetJudgedCode(
  userId: number | undefined,
  result: Pick<SubmissionResult, 'status' | 'problemId' | 'language' | 'sourceCode'>,
): void {
  if (result.status === 'COMPLETED' && typeof result.sourceCode === 'string') {
    forgetSubmittedCode(userId, result.problemId, result.language, result.sourceCode)
  }
}

/**
 * 저장된 코드를 전부 지운다. 로그아웃이 부른다.
 *
 * 키에 사용자가 들어가 있어 B가 A의 코드를 볼 일은 없지만, 로그아웃은 "이 사람의
 * 데이터를 전부 잊는다"는 뜻이다(useLogout 주석). 공용 컴퓨터에서 로그아웃한 사람의
 * 코드가 디스크에 남아 있으면 그 약속이 사실이 아니게 된다.
 *
 * localStorage도 함께 지운다. 예전 버전이 그쪽에 저장해 둔 코드가 디스크에 남아 있을 수 있다.
 */
export function clearSavedCode(): void {
  try {
    removeKeys(sessionStorage, PREFIX)
    removeKeys(localStorage, PREFIX)
  } catch {
    // 저장소를 못 읽는 브라우저에는 지울 것도 없다.
  }
}

/** 풀이 화면을 떠날 때 그 문제의 작성 중 코드를 모든 언어에서 지운다 (SOLVE-11). */
export function forgetProblemDrafts(userId: number | undefined, problemId: number): void {
  if (userId === undefined) return
  try {
    removeKeys(sessionStorage, `${PREFIX}${userId}:${problemId}:`)
  } catch {
    // 저장소를 못 읽는 브라우저에는 지울 것도 없다.
  }
}

/** 지우기 전에 키를 다 모은다. 지우면서 순회하면 인덱스가 밀려 건너뛰는 키가 생긴다. */
function removeKeys(storage: Storage, prefix: string): void {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith(prefix)) keys.push(key)
  }
  for (const key of keys) storage.removeItem(key)
}
