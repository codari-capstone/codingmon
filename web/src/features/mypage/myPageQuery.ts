import { queryOptions } from '@tanstack/react-query'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { CurrentUser, UserActivity } from '@/api/types'

/**
 * 풀이 요약·최근 1년 잔디 (MY-05). 제출하고 돌아오면 오늘 칸이 바로 늘어야 하므로 매번 새로
 * 받는다(학습 통계와 같은 이유).
 *
 * 사용자별 응답이라 키가 `adoptSession`의 제거 대상에 들어 있어야 한다(session.ts).
 */
export function activityQuery() {
  return queryOptions({
    queryKey: ['activity'] as const,
    queryFn: async (): Promise<UserActivity> => {
      const result = await api.GET('/api/users/me/activity')
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
