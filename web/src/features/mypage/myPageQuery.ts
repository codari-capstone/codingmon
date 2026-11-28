import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { CurrentUser, UserActivity } from '@/api/types'

/** 잔디를 고를 수 있는 첫 해. 서비스를 시작한 해라 해가 바뀌어도 그대로다(계약 `year`). */
export const FIRST_ACTIVITY_YEAR = 2026

/**
 * 풀이 요약·연도별 잔디 (MY-05). 제출하고 돌아오면 오늘 칸이 바로 늘어야 하므로 매번 새로
 * 받는다(학습 통계와 같은 이유).
 *
 * `year`를 빼면 서버가 올해(한국 시각)로 정한다. 화면은 이 응답의 `from` 연도로 고를 수 있는
 * 마지막 해를 정한다 — 브라우저 시각으로 정하면 연말·연초에 400이 난다(계약).
 *
 * 사용자별 응답이라 키가 `adoptSession`의 제거 대상(`['activity']` 접두)에 들어 있어야 한다(session.ts).
 */
export function activityQuery(year?: number) {
  return queryOptions({
    queryKey: ['activity', year ?? 'current'] as const,
    queryFn: async (): Promise<UserActivity> => {
      const result = await api.GET('/api/users/me/activity', {
        params: { query: year === undefined ? {} : { year } },
      })
      if (result.data === undefined) fail(result)
      return result.data
    },
    staleTime: 0,
  })
}

/** 닉네임 변경 (MY-02). 바뀐 사용자 정보를 돌려준다(계약). */
export async function updateNickname(nickname: string): Promise<CurrentUser> {
  const result = await api.PATCH('/api/users/me', { body: { nickname } })
  if (result.data === undefined) fail(result)
  return result.data
}

/** 비밀번호 변경 (MY-03). 성공하면 모든 기기에서 로그아웃된다(계약: 204, refresh 쿠키 삭제). */
export async function changePassword(input: {
  currentPassword: string
  newPassword: string
  newPasswordConfirm: string
}): Promise<void> {
  const result = await api.PUT('/api/users/me/password', { body: input })
  if (!result.response.ok) fail(result)
}

/** 회원 탈퇴 (MY-04). 확인 문구는 화면만 검사하고 서버로 보내지 않는다(계약). */
export async function withdraw(): Promise<void> {
  const result = await api.DELETE('/api/users/me')
  if (!result.response.ok) fail(result)
}
