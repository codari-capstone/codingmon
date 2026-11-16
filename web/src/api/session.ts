/**
 * access token 보관 (COM-04).
 *
 * **메모리에만 둔다.** localStorage나 쿠키에 두면 XSS 하나로 샌다 — 지문·에러 원문처럼
 * 남이 쓴 글자를 그리는 화면이 여럿이라 그 위험을 감수할 이유가 없다.
 *
 * 새로고침하면 사라지지만 잃을 것이 없다. refresh token은 서버가 쿠키로 들고 있어
 * (`/api/auth/refresh`의 `in: cookie`) 첫 401에서 새 access token을 받아 온다. 저장해 두는
 * 쪽이 오히려 "만료된 토큰으로 한 번 더 시도"라는 경로를 만든다.
 *
 * 모듈 변수인 이유는 이 값이 요청마다 읽히기 때문이다. React state에 두면 fetch를
 * 부르는 자리마다 훅을 거쳐야 하고, 미들웨어(client.ts)에서는 훅을 쓸 수 없다.
 */
let accessToken: string | null = null

/**
 * 세션 세대. 로그아웃하거나 새 로그인으로 계정을 대체할 때마다 올라간다. 같은 세션의 토큰 갱신은 올리지 않는다.
 *
 * 갱신 요청이 떠 있는 동안 로그아웃하면, 늦게 도착한 응답이 방금 버린 세션의 토큰을 다시
 * 심는다 — 서버의 로그아웃은 refresh 계열만 폐기하고 **이미 발급된 access token은 만료까지
 * 유효**해서, 그 탭은 로그아웃 직후 다시 인증된 상태가 된다. 갱신을 시작할 때 세대를 적어
 * 두었다가 돌아왔을 때 달라졌으면 결과를 버린다.
 */
let generation = 0

/**
 * 이 탭 세션의 계정(JWT `sub`). null이면 이 탭에 세션이 없다.
 *
 * 다른 탭의 로그인·로그아웃 알림은 토큰만 버리고 **이 값은 남긴다.** refresh 쿠키는 탭끼리
 * 함께 쓰므로 다른 탭이 B로 로그인하면 쿠키도 B의 것이 된다. 그때 이 탭이 계정을 잊으면 다음
 * 401의 갱신이 B의 토큰을 그대로 받아, A의 화면이 B의 권한으로 요청한다 — A의 확인 문구로 B가
 * 탈퇴되는 식이다. 계정을 기억해 두고 갱신 결과와 비교해, 같으면 이어 쓰고 다르면 세션을 끝낸다.
 *
 * `subject`가 null이면 계정을 읽을 수 없는 토큰(개발용 MSW의 불투명 토큰)이라 비교하지 않는다.
 */
let owner: { subject: string | null } | null = null

/**
 * 쿠키가 다른 계정의 것으로 바뀐 것을 확인했다. 이 탭에서 다시 로그인하거나 새로 열 때까지 갱신하지
 * 않는다. 다시 물어도 같은 답이고, 물을 때마다 그 계정의 refresh token만 회전한다.
 */
let replaced = false

export function getAccessToken(): string | null {
  return accessToken
}

export function getGeneration(): number {
  return generation
}

/** 같은 세션 안에서 토큰만 바꾼다(갱신에 실패해 비우기 등). 세션의 계정은 그대로다. */
export function setAccessToken(token: string | null): void {
  accessToken = token
}

/** 어느 계정의 토큰인지 읽는다. 서명 검증은 서버가 맡는다. JWT가 아니면 null. */
function tokenSubject(token: string): string | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as {
      sub?: unknown
    }
    return typeof claims.sub === 'string' ? claims.sub : null
  } catch {
    return null
  }
}

/** 이 탭에 세션이 있는지. 다른 탭의 알림으로 토큰을 버렸어도 세션은 남아 있다. */
export function hasSession(): boolean {
  return owner !== null
}

/** 쿠키가 다른 계정의 것으로 바뀐 뒤라 갱신해도 소용없는지. */
export function isSessionReplaced(): boolean {
  return replaced
}

/**
 * 갱신으로 받은 토큰을 이 탭 세션의 것으로 들인다.
 *
 * 세션이 없으면(새로고침 뒤 복원, GitHub 로그인 복귀) 그 계정으로 세션을 시작한다. 세션의 계정과
 * 다른 토큰이면 받지 않고 이 탭의 세션을 끝낸다(false). 화면은 그 요청의 401로 로그인 화면에 간다.
 */
export function adoptRefreshedToken(token: string): boolean {
  const subject = tokenSubject(token)
  if (owner !== null && owner.subject !== null && subject !== owner.subject) {
    accessToken = null
    replaced = true
    return false
  }
  owner ??= { subject }
  accessToken = token
  return true
}

/** 새 로그인은 이전 계정의 비동기 작업을 이어받지 않는다. 토큰 갱신은 adoptRefreshedToken을 쓴다. */
export function startSession(token: string | null): void {
  generation += 1
  accessToken = token
  // 토큰 없이 시작하는 GitHub 로그인 복귀는 곧 갱신으로 받는 토큰의 계정이 세션의 계정이 된다.
  owner = token === null ? null : { subject: tokenSubject(token) }
  replaced = false
  channel?.postMessage('started')
}

/** 다른 탭에 로그인·로그아웃을 알리는 통로. 지원하지 않는 브라우저에서는 null. */
const channel =
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('codingmon-session')

/**
 * 세션을 끝낸다 (COM-03).
 *
 * 토큰을 버리고 세대를 올린다. 세대를 올리는 이유는 위 주석에 있다.
 *
 * **다른 탭에도 알린다.** 전에는 쿠키 세션이라 탭끼리 함께 끊겼는데, access token이
 * 탭마다의 메모리에 있어 한 탭에서 로그아웃해도 다른 탭은 만료될 때까지 인증 요청이
 * 계속 성공한다 — 공용 컴퓨터에서 위험하다. 토큰만 버린다. 그 탭의 화면은 다음 요청이
 * 401을 받을 때 로그인 화면으로 간다(RequireAuth).
 *
 * 이 탭의 계정도 잊는다. 로그아웃·탈퇴는 캐시를 모두 비우므로(useLogout) 다음 세션은 누구의
 * 것이든 처음부터 그린다.
 */
export function endSession(): void {
  accessToken = null
  owner = null
  replaced = false
  generation += 1
  channel?.postMessage('ended')
}

channel?.addEventListener('message', () => {
  // 알린 탭이 아니라 받은 탭에서 도는 자리다. 다시 알리지 않는다(서로 알리면 고리가 된다).
  // 계정(owner)은 남긴다. 다음 갱신이 쿠키의 계정과 비교해 이어 쓸지 세션을 끝낼지 정한다.
  accessToken = null
  generation += 1
})
