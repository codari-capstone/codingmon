import type { CurrentUser } from '@/api/types'

export const WELCOME_PATH = '/welcome'

/**
 * 로그인을 마친 사람이 갈 곳 (WELCOME-01).
 *
 * 처음 안내를 아직 안 봤으면 원래 보던 화면(target)보다 처음 안내가 먼저이고, 그때는
 * target으로 돌아가지 않는다(명세). 이메일 로그인·GitHub 로그인·이미 로그인한 사람의
 * /login이 같이 써서 셋이 갈라지지 않게 한다.
 */
export function afterLoginPath(user: CurrentUser, target: string): string {
  // 값이 빠진 응답은 본 것으로 친다. 모르는 채로 사용자를 끌고 가지 않는다
  return user.welcomeSeen === false ? WELCOME_PATH : target
}
