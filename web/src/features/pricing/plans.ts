import type { IconName } from '@/components/ui/icon'

// 가격·한도의 근거는 #331 '가격 근거'(#323 비용 계산)다. 사용자가 늘어 다시 계산하면 여기만 고친다.
// 플랜별 한도는 #321에서 서버에 적용하기 전까지 화면의 안내일 뿐이다(PRICE 절 끝).

export type Cycle = 'monthly' | 'yearly'

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
      'AI 오답 분석 하루 3회',
      // 실제 힌트 1단계 이름이다(HintSteps: 관찰 → 방향 → 원리). 시안의 '방향'이 아니다
      '힌트 1단계(관찰)까지',
      '최근 30일 학습 기록',
    ],
  },
  {
    id: 'pro',
    name: '프로',
    icon: 'bot',
    audience: '코딩 테스트를 꾸준히 준비할 때',
    price: { monthly: 9900, yearly: 8250 },
    note: { monthly: '매달 자동 결제 · 언제든 해지', yearly: '연 99,000원 한 번에 결제' },
    lead: '무료 플랜의 모든 기능, 그리고',
    features: [
      'AI 오답 분석·풀이 제안 하루 30회',
      '힌트 3단계 모두 열기',
      '맞힌 문제의 더 나은 풀이 제안',
      '오답 노트와 전체 학습 리포트',
      '전체 기간 학습 기록',
    ],
  },
]

/** 비교표 칸. true는 포함, false는 미포함, 글자는 그대로 보여 준다. 순서는 PLANS와 같다 */
type Cell = boolean | string

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
      { label: 'AI 오답 분석', cells: ['하루 3회', '하루 30회'] },
      { label: '단계별 힌트', cells: ['1단계', '3단계'] },
      { label: '더 나은 풀이 제안', cells: [false, true] },
    ],
  },
  {
    group: '내 학습',
    rows: [
      { label: '학습 기록', cells: ['최근 30일', '전체 기간'] },
      { label: '오답 노트 · 학습 리포트', cells: [false, true] },
    ],
  },
]

export const FAQ = [
  {
    value: 'free',
    title: '무료 플랜도 계속 쓸 수 있나요?',
    content:
      '네. 문제 풀이와 채점은 기간 제한 없이 무료예요. AI 오답 분석은 하루 3회까지 쓸 수 있어요.',
  },
  {
    value: 'test',
    title: '실제로 결제되나요?',
    content: '아니요. 지금은 시연용 테스트 결제라 카드에서 돈이 나가지 않아요.',
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

export const TEST_PAYMENT_NOTICE = '시연용 테스트 결제예요. 실제로 돈이 나가지 않아요.'
