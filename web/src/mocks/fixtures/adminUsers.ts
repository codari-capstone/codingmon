import type { AdminUserSummary } from '@/api/types'

const HOUR = 3_600_000
const DAY = 24 * HOUR

type Seed = [nickname: string, email: string | null, suspendedHoursAgo?: number]

/**
 * 관리자 회원 화면(ADM-14~16)의 회원. id는 위치+1이다.
 * 1·2는 목 로그인 계정(users.ts), 3~9는 신고 시드(reports.ts)의 신고자와 닉네임이 같다.
 * 1~4는 가입일 기록 전에 가입해 `createdAt`이 null이다(계약). 21개 이상이라 목록이 두 페이지다.
 * 정지는 둘: 3은 24시간이 지나 강제 탈퇴할 수 있고, 8은 아직 못 한다.
 */
const SEEDS: Seed[] = [
  ['코다리', 'user@codari.test'],
  ['관리자', 'admin@codari.test'],
  ['코딩왕', 'king@example.com', 50],
  ['알고펭', 'algo.peng@example.com'],
  ['파이썬초보', 'pybeginner@example.com'],
  ['디피러버', null],
  ['배열마스터', 'array@example.com'],
  ['밤샘코더', 'nightowl@example.com', 2],
  ['새싹개발자', 'sprout@example.com'],
  ['스택오버', null],
  ['그래프탐험가', 'graph@example.com'],
  ['첫코딩', 'first.code@example.com'],
  ['재귀요정', 'recursion@example.com'],
  ['비트마법사', 'bit@example.com'],
  ['정렬장인', 'sort@example.com'],
  ['큐대기열', null],
  ['해시브라운', 'hash@example.com'],
  ['투포인터', 'two.pointer@example.com'],
  ['이분탐색러', 'binary@example.com'],
  ['그리디맨', 'greedy@example.com'],
  ['트리심기', 'tree@example.com'],
  ['백트래커', 'backtrack@example.com'],
  ['문자열러버', 'string@example.com'],
  ['코린이', 'newbie@example.com'],
]

export function seedAdminUsers(now = Date.now()): AdminUserSummary[] {
  return SEEDS.map(([nickname, email, suspendedHoursAgo], index) => {
    const id = index + 1
    return {
      id,
      nickname,
      email,
      role: id === 2 ? 'ADMIN' : 'USER',
      // 늦게 가입한 회원일수록 최근이다. 목록이 최근 가입순(id 큰 것부터)이라 그 순서와 맞춘다
      createdAt: id <= 4 ? null : new Date(now - (SEEDS.length - index) * DAY).toISOString(),
      suspendedAt:
        suspendedHoursAgo === undefined
          ? null
          : new Date(now - suspendedHoursAgo * HOUR).toISOString(),
    }
  })
}
