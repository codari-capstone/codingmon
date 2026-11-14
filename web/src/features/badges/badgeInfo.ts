import type { BadgeCode } from '@/api/types'
import comeback from '@/assets/badges/comeback.png'
import first from '@/assets/badges/first.png'
import grit from '@/assets/badges/grit.png'
import hard from '@/assets/badges/hard.png'
import master from '@/assets/badges/master.png'
import medium from '@/assets/badges/medium.png'
import noHint from '@/assets/badges/no_hint.png'
import noteKing from '@/assets/badges/note_king.png'
import oneShot from '@/assets/badges/one_shot.png'
import streak14 from '@/assets/badges/streak14.png'
import streak3 from '@/assets/badges/streak3.png'
import streak7 from '@/assets/badges/streak7.png'

export interface BadgeInfo {
  name: string
  /** 아직 못 받았을 때 보여 주는 받는 조건 */
  condition: string
  /** 축하 창에서 해낸 일로 적는 문장 */
  achieved: string
  image: string
}

/**
 * 서버는 코드만 준다(계약 `BadgeCode`). 이름은 기능명세 12절 그대로, 조건은 같은 절의 '받는 조건'이다.
 * `Record`라 계약에 코드가 늘면 tsc가 여기를 가리킨다.
 */
export const BADGE_INFO: Record<BadgeCode, BadgeInfo> = {
  FIRST_SOLVE: {
    name: '첫 정답',
    condition: '아무 문제나 처음 맞히기',
    achieved: '처음으로 문제를 맞혔어요.',
    image: first,
  },
  STREAK_3: {
    name: '3일 연속',
    condition: '3일 연속으로 제출하기',
    achieved: '3일 연속으로 제출했어요.',
    image: streak3,
  },
  STREAK_7: {
    name: '7일 연속',
    condition: '7일 연속으로 제출하기',
    achieved: '7일 연속으로 제출했어요.',
    image: streak7,
  },
  STREAK_14: {
    name: '14일 연속',
    condition: '14일 연속으로 제출하기',
    achieved: '14일 연속으로 제출했어요.',
    image: streak14,
  },
  MEDIUM_SOLVER: {
    name: '보통',
    condition: '보통 문제 5개 맞히기',
    achieved: '보통 문제를 5개 맞혔어요.',
    image: medium,
  },
  HARD_SOLVER: {
    name: '어려움',
    condition: '어려움 문제 1개 맞히기',
    achieved: '어려움 문제를 맞혔어요.',
    image: hard,
  },
  FIRST_TRY: {
    name: '한 번에 맞힘',
    condition: '보통 이상 문제를 첫 제출에 맞히기',
    achieved: '보통 이상 문제를 첫 제출에 맞혔어요.',
    image: oneShot,
  },
  NO_HINT: {
    name: '힌트 없이',
    condition: '보통 이상 문제를 틀린 뒤 힌트 없이 맞히기',
    achieved: '틀린 뒤 힌트 없이 스스로 맞혔어요.',
    image: noHint,
  },
  RETRY: {
    name: '다시 도전',
    condition: '한 문제를 5번 이상 틀린 뒤 맞히기',
    // 명세 12절·서버(RETRY_MIN_ATTEMPTS = 6)는 정확히 5번 틀린 뒤 맞혀도 준다. '넘게'가 아니다(#294 리뷰)
    achieved: '5번 이상 틀려도 포기하지 않고 맞혔어요.',
    image: comeback,
  },
  PERSISTENCE: {
    name: '끈기',
    condition: '판정이 난 제출 50번 하기',
    achieved: '판정이 난 제출이 50번을 넘었어요.',
    image: grit,
  },
  INTERMEDIATE: {
    name: '중급자',
    condition: '쉬움 10개, 보통 10개, 어려움 1개 맞히기',
    achieved: '쉬움 10개, 보통 10개, 어려움 1개를 맞혔어요.',
    // shortcut: 오답 노트 배지를 빼며 남은 그림을 임시로 쓴다(#248). 중급자 그림이 오면 파일만 바꾼다
    image: noteKing,
  },
  MASTER: {
    name: '마스터',
    condition: '공개 중인 문제 모두 맞히기',
    achieved: '공개 중인 문제를 모두 맞혔어요.',
    image: master,
  },
}

/** 배지 화면의 묶음. 서버 순서(기능명세 12절)를 4개씩 끊는다. 색은 그림 테두리 묶음의 `-text` 토큰이다. */
export const BADGE_GROUPS: { title: string; codes: BadgeCode[]; tone: string }[] = [
  {
    title: '꾸준함',
    codes: ['FIRST_SOLVE', 'STREAK_3', 'STREAK_7', 'STREAK_14'],
    tone: 'text-warning-text',
  },
  {
    title: '실력',
    codes: ['MEDIUM_SOLVER', 'HARD_SOLVER', 'FIRST_TRY', 'NO_HINT'],
    tone: 'text-primary-text',
  },
  {
    title: '도전',
    codes: ['RETRY', 'PERSISTENCE', 'INTERMEDIATE', 'MASTER'],
    tone: 'text-success-text',
  },
]

// en-CA는 2026-11-12 모양이다. 받은 시각은 UTC라 한국 날짜로 바꾼다(명세 BADGE-01)
const KST_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })

/** `2026.11.12`. 잘못된 시각이면 빈 문자열(format이 던지면 화면 전체가 오류로 바뀐다). */
export function formatUnlockedAt(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime()) ? '' : KST_DATE.format(at).replaceAll('-', '.')
}
