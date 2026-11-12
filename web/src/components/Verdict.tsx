import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

import type { Verdict as VerdictCode } from '@/api/types'
import { StatusText, type StatusTone } from '@/components/StatusText'
import { STATUS_LABEL, VERDICT_INFO } from '@/constants/verdicts'

/**
 * 계약의 판정에 없는 '채점 중'은 판정이 아니라 진행 상태다. 이름은 결과 화면 헤드라인과 같은
 * `STATUS_LABEL.RUNNING`을 쓴다 — 두 곳에 적으면 한쪽만 고쳐져도 타입 검사는 통과한다.
 */
const JUDGING = { label: STATUS_LABEL.RUNNING, tone: 'info' as StatusTone }

interface VerdictProps {
  verdict: VerdictCode | 'JUDGE_ERROR' | 'JUDGING'
  /** 기본 md. 결과 화면 제목은 lg(24px) */
  size?: 'md' | 'lg'
  /** 판정 색 묶음을 덮어쓸 때만 */
  tone?: StatusTone
  /** 다른 글자가 필요할 때만. 없으면 판정 이름 */
  children?: React.ReactNode
  className?: string
}

/**
 * 채점 결과를 색 글자 + 아이콘으로 보여 준다. 색 면 배지로 바꾸지 않고 아이콘을 빼지 않는다
 * (경고 노랑과 강조 노랑이 가깝다). 이름과 색은 `VERDICT_INFO`가 정한다.
 * 채점 중은 정보 아이콘(i) 대신 Button의 로딩과 같은 돌아가는 아이콘이다.
 */
export function Verdict({ verdict, size = 'md', tone, children, className }: VerdictProps) {
  const judging = verdict === 'JUDGING'
  const info = judging ? JUDGING : VERDICT_INFO[verdict]
  return (
    <StatusText
      tone={tone ?? info.tone}
      className={cn(
        'font-bold',
        size === 'lg' ? 'gap-2 text-2xl tracking-[-0.02em]' : 'text-sm',
        className,
      )}
      icon={judging ? Loader2 : undefined}
      iconClassName={judging ? 'animate-spin motion-reduce:animate-none' : undefined}
    >
      {children ?? info.label}
    </StatusText>
  )
}
