import type { Language, SubmissionResult } from '@/api/types'

/** 이 기능이 쓰는 모든 키의 앞머리. 로그아웃이 이걸로 골라 지운다. */
const PREFIX = 'solve:'

/**
 * 로그아웃·탈퇴로 저장본을 지웠다고 다른 탭에 알리는 통로.
 *
 * 세션 종료 알림과 따로 둔다. 비밀번호 변경도 세션을 끝내지만 같은 사람이 바로 다시 로그인하므로
 * 풀이 코드를 지우지 않는다(PasswordForm 주석).
 */
const clearChannel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('codingmon-saved-code')

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

/** 판정을 기다리는 제출 코드의 자리. 작성 중 코드와 달리 화면을 떠나도 지우지 않는다. */
const HELD_PREFIX = `${PREFIX}held:`

function heldKey(userId: number, problemId: number, language: Language): string {
  return `${HELD_PREFIX}${userId}:${problemId}:${language}`
}

/** 제출 번호는 접수된 뒤에 안다. 코드가 같은 다른 제출의 판정으로 지우지 않으려고 함께 둔다. */
interface HeldCode {
  code: string
  submissionId: number | null
  /** 이 코드를 보내기 전에 자리에 있던 값. 번호 없는 코드가 치워지면 되돌린다. */
  before?: string | null
}

/**
 * 이 문서에서 접수 응답을 기다리는 요청 수(판정 대기 키별).
 *
 * 메모리에 둔다. 문서가 바뀌면 응답을 받을 곳이 없으므로, 저장소에 번호 없이 남은 코드는
 * 여기 없으면 '응답을 영영 못 받는 코드'다. 앱 안에서 떠났다 돌아와 같은 언어로 또 낼 수 있어 센다.
 */
const sending = new Map<string, number>()

/** 문서가 내려가는 중이다. 이때 끊긴 요청은 접수 실패가 아니라 응답을 못 받은 것이다. */
let documentLeaving = false

function isSending(key: string): boolean {
  return (sending.get(key) ?? 0) > 0 && readHeld(key)?.submissionId === null
}

function settleRequest(key: string): void {
  const left = (sending.get(key) ?? 0) - 1
  if (left > 0) sending.set(key, left)
  else sending.delete(key)
}

function readHeld(key: string): HeldCode | null {
  const raw = sessionStorage.getItem(key)
  if (raw === null) return null
  try {
    const held = JSON.parse(raw) as Partial<HeldCode> | null
    return typeof held?.code === 'string'
      ? { code: held.code, submissionId: held.submissionId ?? null, before: held.before ?? null }
      : null
  } catch {
    return null
  }
}

/** 판정 대기 코드를 치우고 그 앞에 있던 값을 되돌린다. */
function dropHeld(key: string, held: HeldCode): void {
  if (held.before) sessionStorage.setItem(key, held.before)
  else sessionStorage.removeItem(key)
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
    return (
      sessionStorage.getItem(savedCodeKey(userId, problemId, language)) ??
      readHeld(heldKey(userId, problemId, language))?.code ??
      null
    )
  } catch {
    return null
  }
}

/** 사용자가 쓰던 코드만. [다시 풀기]가 고른 제출보다 먼저 여는 것은 이쪽뿐이다. */
export function readDraftCode(
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

/**
 * [다시 풀기]의 제출을 받지 못했을 때 열 코드. 쓰던 코드, 없으면 **그 제출의** 판정 대기 코드다.
 * 다른 제출의 판정 대기 코드를 고른 제출인 것처럼 열지 않는다.
 */
export function readMissedRetryCode(
  userId: number | undefined,
  problemId: number,
  language: Language,
  submissionId: number,
): string | null {
  const draft = readDraftCode(userId, problemId, language)
  if (draft !== null || userId === undefined) return draft
  try {
    const held = readHeld(heldKey(userId, problemId, language))
    return held?.submissionId === submissionId ? held.code : null
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
 * 판정이 난 코드의 작성 중 저장본을 지운다. 판정이 난 제출은 제출 기록에서 코드를 볼 수 있다.
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
 * 보내는 코드를 판정이 날 때까지 잡아 두고, 접수가 실패하면 되돌릴 함수를 준다.
 *
 * 채점 불가로 끝난 제출은 제출 기록에 나오지 않아(계약 getMyProblemHistory) 여기 없으면 되찾을
 * 길이 없다. 응답 전에 새로고침해도 남도록 보내기 전에 쓴다. 작성 중 코드와 자리가 달라,
 * 풀이 화면을 다시 열었다 나가도 지워지지 않는다.
 *
 * 접수가 실패하면 그 코드는 서버에도 없다. 화면에 있으면 작성 중 코드로 돌린다. 손대지 않은
 * [다시 풀기] 코드는 작성 중 자리에 없어서, 돌리지 않으면 되찾을 곳이 없다. 이미 떠났으면
 * (`left`) 작성 중 코드는 주소창 이동에 지워지므로, 다시 열어 볼 때까지 이 자리에 둔다
 * (`claimUnansweredCode`). 로그아웃으로 자리가 비었으면 아무것도 되살리지 않는다.
 */
export function keepUntilJudged(
  userId: number | undefined,
  problemId: number,
  language: Language,
  code: string,
): (left?: boolean) => void {
  if (userId === undefined) return () => {}
  const key = heldKey(userId, problemId, language)
  try {
    const before = sessionStorage.getItem(key)
    const held = JSON.stringify({ code, submissionId: null, before } satisfies HeldCode)
    sessionStorage.setItem(key, held)
    sending.set(key, (sending.get(key) ?? 0) + 1)
    return (left = false) => {
      settleRequest(key)
      if (left || documentLeaving) return
      try {
        if (sessionStorage.getItem(key) !== held) return
        if (before === null) sessionStorage.removeItem(key)
        else sessionStorage.setItem(key, before)
        const draftKey = savedCodeKey(userId, problemId, language)
        if (sessionStorage.getItem(draftKey) === null) sessionStorage.setItem(draftKey, code)
      } catch {
        // 저장소를 못 쓰는 브라우저에는 되돌릴 것도 없다.
      }
    }
  } catch {
    return () => {}
  }
}

/** 접수된 제출의 번호를 판정 대기 코드에 적는다. 그사이 다른 코드를 보냈으면 그대로 둔다. */
export function markHeldSubmission(
  userId: number | undefined,
  problemId: number,
  language: Language,
  code: string,
  submissionId: number,
): void {
  if (userId === undefined) return
  try {
    const key = heldKey(userId, problemId, language)
    settleRequest(key)
    const held = readHeld(key)
    if (held?.code === code && held.submissionId === null) {
      sessionStorage.setItem(key, JSON.stringify({ code, submissionId } satisfies HeldCode))
      // 같은 코드의 작성 중 사본을 없앤다. 남으면 '쓰던 코드'로 보여 [다시 풀기]가 고른 제출을 가린다
      forgetSubmittedCode(userId, problemId, language, code)
    }
  } catch {
    // 저장이 막힌 브라우저에는 잡아 둔 코드도 없다.
  }
}

/**
 * 판정이 났으면 그 코드의 저장본을 지운다. 채점 중과 채점 불가는 남긴다.
 *
 * 판정 대기 코드는 **그 제출의 판정으로만** 지운다. 코드만 비교하면 기록에서 연 옛 제출이 같은
 * 코드로 다시 낸 새 제출의 사본을 지운다. 응답을 영영 못 받아 번호가 없는 코드만 코드로 비교한다.
 * 같은 코드가 판정됐으니 제출 기록에서 되찾을 수 있다.
 */
export function forgetJudgedCode(
  userId: number | undefined,
  result: Pick<SubmissionResult, 'id' | 'status' | 'problemId' | 'language' | 'sourceCode'>,
): void {
  if (result.status !== 'COMPLETED' || typeof result.sourceCode !== 'string') return
  forgetSubmittedCode(userId, result.problemId, result.language, result.sourceCode)
  if (userId === undefined) return
  try {
    const key = heldKey(userId, result.problemId, result.language)
    const held = readHeld(key)
    const unanswered =
      held?.submissionId === null && held.code === result.sourceCode && !isSending(key)
    if (held && (held.submissionId === result.id || unanswered)) dropHeld(key, held)
  } catch {
    // 저장소를 못 읽는 브라우저에는 지울 것도 없다.
  }
}

/**
 * 응답을 영영 못 받은 코드를 화면에 열었으면 작성 중 코드로 옮긴다.
 *
 * 열어 본 뒤로는 쓰던 코드와 같아서 떠나면 지워진다. 열어 보기 전에는 유일한 사본일 수 있어
 * 어떤 정리로도 지우지 않는다. 더 새로 쓴 작성 중 코드가 있으면 그쪽을 둔다.
 */
export function claimUnansweredCode(
  userId: number | undefined,
  problemId: number,
  language: Language,
): void {
  if (userId === undefined) return
  try {
    const key = heldKey(userId, problemId, language)
    const held = readHeld(key)
    if (held?.submissionId !== null || isSending(key)) return
    const draftKey = savedCodeKey(userId, problemId, language)
    if (sessionStorage.getItem(draftKey) === null) sessionStorage.setItem(draftKey, held.code)
    dropHeld(key, held)
  } catch {
    // 저장소를 못 쓰는 브라우저에는 옮길 것도 없다.
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
 * 저장소가 탭마다 따로라 다른 탭에도 지우라고 알린다.
 */
export function clearSavedCode(): void {
  clearThisTab()
  clearChannel?.postMessage('clear')
}

function clearThisTab(): void {
  try {
    removeKeys(sessionStorage, PREFIX)
    removeKeys(localStorage, PREFIX)
  } catch {
    // 저장소를 못 읽는 브라우저에는 지울 것도 없다.
  }
}

/**
 * 풀이 화면을 떠날 때 그 문제의 작성 중 코드를 모든 언어에서 지운다 (SOLVE-11).
 *
 * 보낸 코드는 판정 대기 자리에 따로 있어 여기서 지워지지 않는다.
 */
export function forgetProblemDrafts(userId: number | undefined, problemId: number): void {
  if (userId === undefined) return
  try {
    removeKeys(sessionStorage, `${PREFIX}${userId}:${problemId}:`)
  } catch {
    // 저장소를 못 읽는 브라우저에는 지울 것도 없다.
  }
}

/**
 * 문서를 새로 불러왔을 때 저장본을 정리한다.
 *
 * 주소창으로 옮기면 React cleanup이 돌지 않으므로 다음 문서가 '화면을 떠남'을 대신 처리한다.
 * 새로고침과 뒤로 가기는 그대로 두고, GitHub 로그인 복귀는 세션이 끊겨 다녀온 길이라 남긴다.
 * 예전 버전의 localStorage 저장본은 새로고침일 때만 옮기고 어느 경우든 지운다.
 * 판정 대기 코드는 여기서 건드리지 않는다. 응답을 못 받은 코드도 다시 열어 볼 때까지 남긴다.
 */
export function settleSavedCodeOnLoad(navigationType: string | undefined, pathname: string): void {
  try {
    if (navigationType === 'reload') {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith(PREFIX) || sessionStorage.getItem(key) !== null) continue
        sessionStorage.setItem(key, localStorage.getItem(key) ?? '')
      }
    }
    removeKeys(localStorage, PREFIX)
    if (navigationType === 'navigate' && pathname !== '/login/github') {
      removeKeys(sessionStorage, PREFIX, (key) => !key.startsWith(HELD_PREFIX))
    }
    sending.clear()
  } catch {
    // 저장소를 못 읽는 브라우저에는 정리할 것도 없다.
  }
}

/**
 * 앱이 시작될 때 한 번 부른다(main.tsx).
 *
 * 저장소가 탭마다 따로라, 다른 탭의 로그아웃·탈퇴 알림을 받아 이 탭의 코드도 지운다(MY-04).
 * 받은 탭은 다시 알리지 않는다(서로 알리면 고리가 된다).
 */
export function startSavedCodeSync(): void {
  const entry = performance.getEntriesByType('navigation')[0] as
    PerformanceNavigationTiming | undefined
  settleSavedCodeOnLoad(entry?.type, window.location.pathname)
  clearChannel?.addEventListener('message', (event: MessageEvent) => {
    if (event.data === 'clear') clearThisTab()
  })
  window.addEventListener('pagehide', () => {
    documentLeaving = true
  })
  // 뒤로 가기 캐시에서 살아 돌아온 문서는 다시 정상 동작한다
  window.addEventListener('pageshow', () => {
    documentLeaving = false
  })
}

/** 지우기 전에 키를 다 모은다. 지우면서 순회하면 인덱스가 밀려 건너뛰는 키가 생긴다. */
function removeKeys(
  storage: Storage,
  prefix: string,
  matches: (key: string) => boolean = () => true,
): void {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i)
    if (key?.startsWith(prefix) && matches(key)) keys.push(key)
  }
  for (const key of keys) storage.removeItem(key)
}
