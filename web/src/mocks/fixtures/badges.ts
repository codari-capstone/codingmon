import type { BadgeCode, UserBadge } from '@/api/types'

/** 계약 `BadgeCode`의 순서. 서버도 이 순서로 12개를 준다. */
export const BADGE_CODES: BadgeCode[] = [
  'FIRST_SOLVE',
  'STREAK_3',
  'STREAK_7',
  'STREAK_14',
  'MEDIUM_SOLVER',
  'HARD_SOLVER',
  'FIRST_TRY',
  'NO_HINT',
  'RETRY',
  'PERSISTENCE',
  'INTERMEDIATE',
  'MASTER',
]

/**
 * 1번 회원은 첫 정답과 3일 연속을 받았고 둘 다 축하했다. 연속 학습 fixture가 어제까지 3일이라
 * 3일 연속이 있는 것이 맞고, 오늘 제출해도 4일이라 새 배지는 없다 — 축하 전 배지를 두면 제출하는
 * e2e마다 결과 화면이 창에 가려진다. 축하 창은 단위 테스트(Badges.test.tsx)가 응답을 바꿔 본다.
 * 그 밖의 회원은 받은 배지가 없다.
 */
function seed(): Map<number, Map<BadgeCode, { unlockedAt: string; celebrated: boolean }>> {
  return new Map([
    [
      1,
      new Map([
        ['FIRST_SOLVE', { unlockedAt: '2026-10-02T03:00:00Z', celebrated: true }],
        // UTC 15시 이후는 한국 날짜로 다음 날이다(화면은 11.13으로 보여야 한다)
        ['STREAK_3', { unlockedAt: '2026-11-12T15:30:00Z', celebrated: true }],
      ]),
    ],
  ])
}

const unlocked = seed()

export function badgesFor(userId: number): UserBadge[] {
  const mine = unlocked.get(userId)
  return BADGE_CODES.map((code) => {
    const got = mine?.get(code)
    return { code, unlockedAt: got?.unlockedAt ?? null, celebrated: got?.celebrated ?? false }
  })
}

/** 받은 배지면 축하함으로 바꾸고 true. 못 받았으면 false(핸들러가 404). 이미 축하했어도 true다(계약). */
export function celebrate(userId: number, code: BadgeCode): boolean {
  const got = unlocked.get(userId)?.get(code)
  if (!got) return false
  got.celebrated = true
  return true
}
