import type { IconName } from '@/components/ui/icon'

// 가격·한도의 근거는 #331 '가격 근거'(#323 비용 계산)다. 사용자가 늘어 다시 계산하면 여기만 고친다.
// AI 한도와 힌트 단계는 서버가 플랜별로 나눈다(PRICE-04). 학습 기록 기간은 나누지 않고 문구로만 둔다(#321).

export type Cycle = 'monthly' | 'yearly'

export const won = (n: number) => n.toLocaleString('ko-KR')

// 프로 가격(원). 연간은 한 달로 나눈 값이다. 연 총액과 할인 배지는 여기서 계산한다(#333 리뷰)
const PRO_PRICE: Record<Cycle, number> = { monthly: 9900, yearly: 8250 }

/** 한 번에 결제하는 금액(원). 월간 9,900원, 연간 99,000원. 서버가 정하는 금액과 같다(계약 `BillingCycle`) */
export const proCharge = (cycle: Cycle) =>
  cycle === 'monthly' ? PRO_PRICE.monthly : PRO_PRICE.yearly * 12

/**
 * 연간 결제로 아끼는 달 수. 토글의 'N개월 무료' 배지다. 내림이라 할인을 부풀리지 않고,
 * 한 달도 안 되면 0이라 배지를 숨긴다(#333 리뷰)
 */
export const YEARLY_FREE_MONTHS = Math.floor(
  // 아낀 금액 ÷ 월 가격. 정수끼리 나눠야 나눠떨어질 때 1.999…로 내려가지 않는다
  ((PRO_PRICE.monthly - PRO_PRICE.yearly) * 12) / PRO_PRICE.monthly,
)

/** 하루 AI 분석·리뷰 횟수(합산). 문구는 모두 이 값에서 만든다(#333 리뷰) */
export const AI_DAILY = { free: 3, pro: 30 }

export const COMPARE_NOTE = `하루 ${AI_DAILY.free}회·${AI_DAILY.pro}회는 AI 오답 분석과 더 나은 풀이 제안을 합친 횟수예요.`

export interface Plan {
  id: 'free' | 'pro'
  name: string
  icon: IconName
  audience: string
  /** 주기별 가격(원). 연간은 한 달로 나눈 값이다 */
  price: Record<Cycle, number>
  /** 가격 아래 문구 */
  note: Record<Cycle, string>
  /** 기능 목록 위의 한 줄. 없으면 넣지 않는다 */
  lead?: string
  features: string[]
}

export const PLANS: Plan[] = [
  {
    id: 'free',
    name: '무료',
    icon: 'code',
    audience: '코딩 연습을 처음 시작할 때',
    price: { monthly: 0, yearly: 0 },
    note: { monthly: '카드 등록 없이 바로 시작', yearly: '카드 등록 없이 바로 시작' },
    features: [
      '모든 문제 풀이와 채점',
      '제출 횟수 제한 없음',
      // 리뷰(더 나은 풀이 제안)도 무료다. 한도는 분석과 합산(랜딩 FAQ, #333 리뷰)
      `AI 오답 분석·풀이 제안 하루 ${AI_DAILY.free}회`,
      // 실제 힌트 1단계 이름이다(HintSteps: 관찰 → 방향 → 원리). 시안의 '방향'이 아니다
      '힌트 1단계(관찰)까지',
      '최근 30일 학습 기록',
      // 리포트는 요금제와 상관없이 지금처럼 쓴다(#321 댓글)
      '학습 리포트',
    ],
  },
  {
    id: 'pro',
    name: '프로',
    icon: 'bot',
    audience: '코딩 테스트를 꾸준히 준비할 때',
    price: PRO_PRICE,
    note: {
      monthly: '매달 자동 결제 · 언제든 해지',
      yearly: `연 ${won(proCharge('yearly'))}원 한 번에 결제`,
    },
    lead: '무료 플랜의 모든 기능, 그리고',
    features: [
      `AI 오답 분석·풀이 제안 하루 ${AI_DAILY.pro}회`,
      '힌트 3단계 모두 열기',
      // 오답 노트는 넣지 않는다. 만들지 않기로 한 기능이다(LearnNav, #248)
      '전체 기간 학습 기록',
    ],
  },
]

export const PRO_PLAN = PLANS.find((p) => p.id === 'pro')!

export const CYCLE_NAME = { monthly: '월간', yearly: '연간' } as const

/** 비교표 칸. true는 포함(체크), 글자는 그대로 보여 준다. 순서는 PLANS와 같다 */
type Cell = true | string

export const COMPARE: { group: string; rows: { label: string; cells: [Cell, Cell] }[] }[] = [
  {
    group: '문제 풀이',
    rows: [
      { label: '문제 풀이와 채점', cells: [true, true] },
      { label: '제출 횟수', cells: ['제한 없음', '제한 없음'] },
    ],
  },
  {
    group: 'AI 학습 도우미',
    rows: [
      { label: 'AI 오답 분석', cells: [`하루 ${AI_DAILY.free}회`, `하루 ${AI_DAILY.pro}회`] },
      { label: '단계별 힌트', cells: ['1단계', '3단계'] },
      { label: '더 나은 풀이 제안', cells: [true, true] },
    ],
  },
  {
    group: '내 학습',
    rows: [
      { label: '학습 기록', cells: ['최근 30일', '전체 기간'] },
      { label: '학습 리포트', cells: [true, true] },
    ],
  },
]

export const FAQ = [
  {
    value: 'free',
    title: '무료 플랜도 계속 쓸 수 있나요?',
    content: `네. 문제 풀이와 채점은 기간 제한 없이 무료예요. AI 오답 분석과 풀이 제안은 합쳐서 하루 ${AI_DAILY.free}회까지 쓸 수 있어요.`,
  },
  {
    value: 'cancel',
    title: '해지하면 바로 끊기나요?',
    content:
      '아니요. 결제한 기간이 끝날 때까지 프로를 그대로 쓸 수 있고, 그다음부터 무료 플랜으로 바뀌어요.',
  },
  {
    value: 'cycle',
    title: '월간에서 연간으로 바꿀 수 있나요?',
    content: '네. 바꾼 결제 주기는 지금 쓰는 기간이 끝난 다음 결제부터 적용돼요.',
  },
  {
    value: 'method',
    title: '어떤 결제 수단을 쓸 수 있나요?',
    content: '신용카드와 체크카드로 결제할 수 있어요.',
  },
]
