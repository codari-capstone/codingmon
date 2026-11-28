import type { AdminSolvedProblem, AdminUserDetail, AdminUserSubmission } from '@/api/types'
import { problemHistories, submissionsOf } from './history'

const HOUR = 3_600_000
const DAY = 24 * HOUR

/**
 * 목이 들고 있는 회원. 오늘 AI 사용량(`aiQuota`)과 구독(`subscription`)은 응답할 때 붙인다.
 * 구독은 목 결제가 쓰는 저장소(subscriptions.ts)에서 읽는다
 */
export type MockAdminUser = Omit<AdminUserDetail, 'aiQuota' | 'subscription'>

type Seed = [
  nickname: string,
  email: string | null,
  suspension?: { hoursAgo: number; reason: string | null },
]

/**
 * 관리자 회원 화면(ADM-14~16)의 회원. id는 위치+1이다.
 * 1·2는 목 로그인 계정(users.ts), 3~9는 신고 시드(reports.ts)의 신고자와 닉네임이 같다.
 * 1~4는 가입일 기록 전에 가입해 `createdAt`이 null이다(계약). 21개 이상이라 목록이 두 페이지다.
 * 정지는 둘: 3은 24시간이 지나 강제 탈퇴할 수 있고, 8은 아직 못 한다. 이메일이 없으면 GitHub 가입이다.
 */
const SEEDS: Seed[] = [
  ['코다리', 'user@codari.test'],
  ['관리자', 'admin@codari.test'],
  ['코딩왕', 'king@example.com', { hoursAgo: 50, reason: '다른 사람의 풀이를 그대로 제출함' }],
  ['알고펭', 'algo.peng@example.com'],
  ['파이썬초보', 'pybeginner@example.com'],
  ['디피러버', null],
  ['배열마스터', 'array@example.com'],
  ['밤샘코더', 'nightowl@example.com', { hoursAgo: 2, reason: null }],
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

export function seedAdminUsers(now = Date.now()): MockAdminUser[] {
  return SEEDS.map(([nickname, email, suspension], index) => {
    const id = index + 1
    return {
      id,
      nickname,
      email,
      role: id === 2 ? 'ADMIN' : 'USER',
      loginMethod: email === null ? 'GITHUB' : 'EMAIL',
      // 늦게 가입한 회원일수록 최근이다. 목록이 최근 가입순(id 큰 것부터)이라 그 순서와 맞춘다
      createdAt: id <= 4 ? null : new Date(now - (SEEDS.length - index) * DAY).toISOString(),
      suspendedAt: suspension ? new Date(now - suspension.hoursAgo * HOUR).toISOString() : null,
      suspensionReason: suspension?.reason ?? null,
      // 결제 기록은 없다. 구독은 응답할 때 subscriptions.ts에서 읽는다(처음에는 모두 구독한 적 없음)
      subscriptionStartedAt: null,
      refundAmount: null,
      payments: [],
    }
  })
}

/**
 * 제출 기록이 있는 회원. 학습자 제출 기록 목(history.ts)을 그대로 그 회원의 것으로 본다 —
 * 제출 번호가 같아 `GET /api/admin/submissions/{id}`도 `pastSubmission`으로 답한다. 나머지는 기록이 없다.
 */
const ACTIVE_USERS = [1, 3]

/** 회원의 제출, 최신순(번호 큰 것부터). 92개라 다섯 페이지다 */
export function userSubmissions(userId: number): AdminUserSubmission[] {
  if (!ACTIVE_USERS.includes(userId)) return []
  return problemHistories
    .flatMap((history) =>
      submissionsOf(history.problemId).map((item): AdminUserSubmission => ({
        id: item.id,
        problemId: history.problemId,
        problemTitle: history.title,
        language: item.language,
        status: item.status === 'JUDGE_ERROR' ? 'JUDGE_ERROR' : 'COMPLETED',
        verdict: item.verdict,
        submittedAt: item.submittedAt,
      })),
    )
    .sort((a, b) => b.id - a.id)
}

/** 회원이 맞힌 문제. 처음 맞힌 제출은 그 문제의 정답 제출이다(history.ts) */
export function userSolvedProblems(userId: number): AdminSolvedProblem[] {
  if (!ACTIVE_USERS.includes(userId)) return []
  return problemHistories
    .filter((history) => history.solved)
    .map((history) => ({
      problemId: history.problemId,
      title: history.title,
      firstSolvedAt:
        submissionsOf(history.problemId).find((item) => item.verdict === 'ACCEPTED')?.submittedAt ??
        new Date(0).toISOString(),
      attemptCount: history.attemptCount,
    }))
}
