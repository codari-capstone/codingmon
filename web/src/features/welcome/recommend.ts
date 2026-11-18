import type { Language } from '@/api/types'

/** 질문 세 가지의 선택지 (WELCOME-02). 문구는 명세 14장 그대로다. 답은 저장하지 않는다. */
export const LANGUAGES = [
  { value: 'PYTHON', label: 'Python', description: '문법이 쉬워 처음 시작하기 좋아요' },
  { value: 'CPP', label: 'C++', description: '실행이 빠르고 코딩 테스트에서 많이 써요' },
] as const satisfies readonly { value: Language; label: string; description: string }[]

export const EXPERIENCES = [
  { value: 'NEW', label: '처음이에요' },
  { value: 'SOME', label: '몇 문제 풀어 봤어요' },
  { value: 'REGULAR', label: '꾸준히 풀어 왔어요' },
] as const

export const GOALS = [
  { value: 'BASICS', label: '기초 문법 익히기' },
  { value: 'ALGORITHMS', label: '알고리즘 실력 키우기' },
  { value: 'CODING_TEST', label: '코딩 테스트 준비' },
] as const

export type Experience = (typeof EXPERIENCES)[number]['value']
export type Goal = (typeof GOALS)[number]['value']

/**
 * 경험 × 목표 → 추천 첫 문제 번호 (WELCOME-03). 운영 서버의 문제 번호다.
 * 문제를 다시 등록해 번호가 바뀌면 docs/feature-spec.md 14장의 표와 함께 고친다.
 */
const TABLE: Record<Experience, Record<Goal, number>> = {
  NEW: { BASICS: 1, ALGORITHMS: 2, CODING_TEST: 3 },
  SOME: { BASICS: 26, ALGORITHMS: 5, CODING_TEST: 6 },
  REGULAR: { BASICS: 4, ALGORITHMS: 9, CODING_TEST: 10 },
}

export function recommendedProblemId(experience: Experience, goal: Goal): number {
  return TABLE[experience][goal]
}
