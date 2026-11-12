import { cn } from 'cn'

import type { Verdict as VerdictCode } from '@/api/types'
import { StatusText, type StatusTone } from '@/components/StatusText'
import { VERDICT_INFO } from '@/constants/verdicts'

/** 계약의 판정에 없는 '채점 중'은 판정이 아니라 진행 상태라 여기서만 더한다. */
const JUDGING = { label: '채점 중', tone: 'info' as StatusTone }

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
 */
export function Verdict({ verdict, size = 'md', tone, children, className }: VerdictProps) {
  const info = verdict === 'JUDGING' ? JUDGING : VERDICT_INFO[verdict]
  return (
    <StatusText
      tone={tone ?? info.tone}
      className={cn(
        'font-bold',
        size === 'lg' ? 'gap-2 text-2xl tracking-[-0.02em]' : 'text-sm',
        className,
      )}
      iconClassName={verdict === 'JUDGING' ? 'animate-spin motion-reduce:animate-none' : undefined}
    >
      {children ?? info.label}
    </StatusText>
  )
}
