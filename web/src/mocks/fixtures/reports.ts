import type { AdminReportDetail, ReportStatus, ReportType } from '@/api/types'

import { problemDetails } from './problemDetails'

type Seed = [
  problemId: number | null,
  type: ReportType,
  reporter: [id: number, nickname: string] | null,
  status: ReportStatus,
  content: string,
  adminMemo?: string,
]

/** 지워진 문제의 신고. 문제가 없어 신고 당시 제목만 남는다 */
const DELETED_TITLE = '연습 문제 13'

/**
 * 관리자 신고 화면(ADM-13)이 처음 띄울 신고. 위가 오래된 것이다(id 1부터).
 * 상태 다섯 가지, 지워진 문제(problemId null)의 세 경우(문제 삭제됨·처리 완료·반려), 탈퇴한 신고자를 고루 둔다.
 * 21개라 한 페이지(20개)를 넘는다 — 페이지 이동을 목에서도 본다.
 */
const SEEDS: Seed[] = [
  [1, 'OTHER', [1, '코다리'], 'RESOLVED', '설명이 조금 헷갈렸어요.', '문장 다듬어서 v2로 공개.'],
  [8, 'TYPO', [5, '파이썬초보'], 'RESOLVED', '"회전"이 "회잔"으로 적혀 있어요.'],
  [
    5,
    'SAMPLE',
    [6, '디피러버'],
    'REJECTED',
    '예제 1 답이 틀린 것 같아요.',
    '예제 맞음. 문제 해석 차이.',
  ],
  [4, 'TEST_CASE', [7, '배열마스터'], 'RESOLVED', '빈 문자열 케이스가 없어요.'],
  [
    null,
    'STATEMENT',
    [8, '밤샘코더'],
    'PROBLEM_DELETED',
    '문제 설명에 N의 범위가 두 번 다르게 적혀 있어요.',
    '문제 정리하면서 삭제함.',
  ],
  [6, 'OTHER', [9, '새싹개발자'], 'REJECTED', '너무 어려워요.'],
  [2, 'TYPO', [3, '코딩왕'], 'RESOLVED', '출력 설명에 마침표가 두 개예요.'],
  [
    7,
    'IO_DESCRIPTION',
    null,
    'IN_PROGRESS',
    '입력 설명에는 구간이 정렬돼서 들어온다고 되어 있는데,\n예제 2를 보면 정렬되지 않은 순서로 들어와요. 어느 쪽이 맞나요?',
    '예제 2 확인 중.',
  ],
  [3, 'TEST_CASE', [4, '알고펭'], 'RECEIVED', '닫는 괄호만 있는 입력이 없어요.'],
  [1, 'SAMPLE', [1, '코다리'], 'RECEIVED', '예제 2의 출력이 문제 설명과 달라요.'],
  [
    null,
    'TYPO',
    [3, '코딩왕'],
    'RESOLVED',
    '제목에 오타가 있어요.',
    '고친 뒤 문제를 정리하며 삭제.',
  ],
  [null, 'OTHER', [4, '알고펭'], 'REJECTED', '비슷한 문제가 또 있어요.'],
  [2, 'STATEMENT', [6, '디피러버'], 'RESOLVED', '유니코드 문자열도 뒤집어야 하나요?'],
  [3, 'OTHER', [7, '배열마스터'], 'REJECTED', '힌트가 있으면 좋겠어요.'],
  [4, 'IO_DESCRIPTION', [9, '새싹개발자'], 'RESOLVED', '출력 순서가 설명에 없어요.'],
  [5, 'TEST_CASE', [5, '파이썬초보'], 'IN_PROGRESS', '길이 1인 배열 케이스가 없어요.'],
  [6, 'TYPO', [8, '밤샘코더'], 'RESOLVED', '"편집"이 "편짐"으로 적혀 있어요.'],
  [7, 'SAMPLE', [1, '코다리'], 'RECEIVED', '예제 3의 구간이 겹치지 않는데 합쳐져 있어요.'],
  [8, 'OTHER', null, 'REJECTED', '회전 방향을 바꿔 주세요.'],
  [1, 'TEST_CASE', [4, '알고펭'], 'IN_PROGRESS', '음수 케이스가 없는 것 같아요.'],
  [2, 'IO_DESCRIPTION', [3, '코딩왕'], 'RECEIVED', '입력 끝에 줄바꿈이 있는지 알려 주세요.'],
]

/** 처음 신고 목록. 매번 새 객체를 만든다 — 목이 고쳐도 다음 테스트에 새지 않게 */
export function seedReports(now = Date.now()): AdminReportDetail[] {
  return SEEDS.map(([problemId, type, reporter, status, content, adminMemo], index) => {
    const detail = problemId === null ? undefined : problemDetails.find((p) => p.id === problemId)
    // 위가 오래된 것이다. 하루에 하나씩, 마지막이 어제
    const createdAt = new Date(now - (SEEDS.length - index) * 86_400_000).toISOString()
    return {
      id: index + 1,
      problemId,
      problemTitle: detail?.title ?? DELETED_TITLE,
      versionNo: detail?.versionNo ?? 1,
      type,
      content,
      reporterId: reporter?.[0] ?? null,
      reporterNickname: reporter?.[1] ?? null,
      createdAt,
      status,
      adminMemo: adminMemo ?? null,
      updatedAt: status === 'RECEIVED' && !adminMemo ? null : createdAt,
    }
  })
}
