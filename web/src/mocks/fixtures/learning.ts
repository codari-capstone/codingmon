import type { LearningStats } from '@/api/types'

/** 조건 미달: 맞힌 문제 2개, 3개 더 맞혀야 한다. 이때 `concepts`는 빈 배열이다(계약). */
export const learningStatsShort: LearningStats = {
  solvedProblemCount: 2,
  requiredProblemCount: 5,
  remainingProblemCount: 3,
  concepts: [],
}

/**
 * 조건 충족. 계약의 정렬(취약 점수 높은 순 → 문제 수 많은 순 → slug 순)과 `weak`(상위 2개,
 * 점수 > 0)를 지킨 값이다. 마지막 줄은 점수가 0이라 상위 2개 안이어도 취약이 아니다.
 */
export const learningStatsReady: LearningStats = {
  solvedProblemCount: 7,
  requiredProblemCount: 5,
  remainingProblemCount: 0,
  concepts: [
    {
      slug: 'dp',
      name: '동적 계획법',
      problemCount: 4,
      solvedCount: 1,
      solveRate: 0.25,
      averageAttempts: 4.5,
      averageHintLevel: 2.5,
      weaknessScore: 0.8,
      weak: true,
    },
    {
      slug: 'graph',
      name: '그래프',
      problemCount: 3,
      solvedCount: 1,
      solveRate: 0.33,
      averageAttempts: 3,
      averageHintLevel: 1.67,
      weaknessScore: 0.6,
      weak: true,
    },
    {
      slug: 'string',
      name: '문자열',
      problemCount: 5,
      solvedCount: 4,
      solveRate: 0.8,
      averageAttempts: 1.6,
      averageHintLevel: 0.4,
      weaknessScore: 0.17,
      weak: false,
    },
    {
      slug: 'math',
      name: '수학',
      problemCount: 2,
      solvedCount: 2,
      solveRate: 1,
      averageAttempts: 1,
      averageHintLevel: 0,
      weaknessScore: 0,
      weak: false,
    },
  ],
}
