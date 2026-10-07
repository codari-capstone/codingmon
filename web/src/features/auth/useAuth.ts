export interface AuthUser {
  id: string
  nickname: string
  role: 'USER' | 'ADMIN'
}

export interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
}

/**
 * 로그인 상태. 화면은 이 훅만 보고, 로그인 방식(#18)이 정해지면 여기 안만 바꾼다.
 *
 * 지금은 비로그인으로 고정한 stub다. 세션 조회를 붙일 때는 반환 타입을 그대로 두고
 * TanStack Query로 /api/me를 읽어 isLoading을 실제 값으로 바꾸면 된다.
 */
export function useAuth(): AuthState {
  return { user: null, isAuthenticated: false, isLoading: false }
}
