import type {
  ConceptStat,
  LearningReport,
  LearningReportRecommendation,
  LearningStats,
} from '@/api/types'
import { problems } from './problems'

/** 조건 미달: 맞힌 문제 2개, 3개 더 맞혀야 한다. 이때 `concepts`는 빈 배열이다(계약). */
export const learningStatsShort: LearningStats = {
  solvedProblemCount: 2,
  requiredProblemCount: 5,
  remainingProblemCount: 3,
  concepts: [],
}

/**
 * 조건 충족. 계약의 정렬(취약 점수 높은 순 → 문제 수 많은 순 → slug 순)과 `weak`(상위 2개,
 * 점수 > 0)를 지킨 값이다. 취약은 위의 두 줄뿐이고, 마지막 줄은 점수 0인 개념이다.
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

/**
 * 학습 리포트 (REP-03~05). 통계는 `learningStatsReady`를 만들 때 저장한 값이다.
 * 추천은 계약의 규칙대로 1위 취약 개념(동적 계획법)에서 2개를 고르고, 2위(그래프)에는 고를 문제가 없어 도전 문제로 채운 모양이다.
 * 제목·난이도·풀이 상태는 문제 목록 fixture와 같게 둔다. 문장은 `COMPLETED`일 때만 있다(계약).
 */
export function learningReportOf(
  status: LearningReport['status'],
  generatedAt: string,
): LearningReport {
  const done = status === 'COMPLETED'
  const [dp, graph] = learningStatsReady.concepts
  const recommended = (
    rank: number,
    problemId: number,
    concept: ConceptStat | null,
    reason: string,
  ): LearningReportRecommendation => {
    const found = problems.find((p) => p.id === problemId)
    if (!found) throw new Error(`문제 fixture에 ${problemId}번이 없다`)
    return {
      rank,
      problemId,
      title: found.title,
      difficulty: found.difficulty,
      concept: concept && {
        slug: concept.slug,
        name: concept.name,
        weaknessScore: concept.weaknessScore,
      },
      // 목록 fixture는 로그인하지 않은 모양도 있어 비어 있을 수 있다
      solveStatus: found.solveStatus ?? 'UNSOLVED',
      reason: done ? reason : null,
    }
  }
  return {
    reportDate: generatedAt.slice(0, 10),
    status,
    failureReason: status === 'FAILED' ? 'UNAVAILABLE' : null,
    generatedAt,
    solvedProblemCount: learningStatsReady.solvedProblemCount,
    concepts: learningStatsReady.concepts,
    summary: done
      ? '7문제를 맞혔고 문자열 문제는 꾸준히 잘 풀고 있어요. 동적 계획법과 그래프를 조금 더 연습하면 좋겠어요.'
      : null,
    weakConcepts: [
      {
        slug: dp.slug,
        name: dp.name,
        explanation: done
          ? '동적 계획법은 작은 문제의 답을 저장해 두고 큰 문제를 풀 때 다시 쓰는 방법이에요. 해결률 25%로 아직 맞히지 못한 문제가 많아요.'
          : null,
        practice: done
          ? '작은 입력으로 표를 직접 채워 보며 앞 칸의 값이 다음 칸에 어떻게 쓰이는지 적어 보세요. 가장 긴 증가 부분 수열부터 다시 도전해 봐요.'
          : null,
      },
      {
        slug: graph.slug,
        name: graph.name,
        // 수치가 통계와 맞지 않아 서버가 문장을 모두 지운 경우(계약). 화면은 이 글을 빼고 보여 준다.
        explanation: null,
        practice: done ? '점과 선을 종이에 그리고 방문한 점에 표시하며 따라가 보세요.' : null,
      },
    ],
    recommendations: [
      recommended(
        1,
        5,
        dp,
        '전에 맞히지 못한 문제예요. 표를 채우는 순서를 다시 따라가 보며 도전해 봐요.',
      ),
      recommended(2, 6, dp, '두 문자열을 한 칸씩 비교하며 표를 채우는 연습을 할 수 있어요.'),
      recommended(3, 3, null, '실력을 넓혀 줄 도전 문제예요.'),
    ],
  }
}
