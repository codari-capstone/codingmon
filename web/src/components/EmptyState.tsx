import { Link } from 'react-router'

import { Verdict } from '@/components/Verdict'
import { Button } from '@/components/ui/button'
import { Mascot, type MascotPose } from '@/components/ui/mascot'

interface EmptyStateProps {
  title: string
  description?: string
  /**
   * 다음에 할 행동. 빈 상태는 안내로 끝내지 않고 길을 알려 준다 (UX-03). 버튼은 하나만 둔다.
   * `{ label, to }`면 링크 버튼을 그리고, 그 밖의 노드는 그대로 둔다.
   */
  action?: { label: string; to: string; state?: unknown } | React.ReactNode
  /**
   * 펭귄 자세. 기본 empty. 성공 success, 서버·네트워크 문제 error, 점검 maintenance, 권한 없음 access-denied.
   * 오답은 incorrect — error를 '틀렸습니다'에 쓰지 않는다.
   */
  pose?: MascotPose
  /** 판정 줄을 제목 위에 (예: ACCEPTED) */
  verdict?: React.ComponentProps<typeof Verdict>['verdict']
  /** false면 펭귄 없이 */
  mascot?: boolean
  mascotSize?: number
  /**
   * 화면 전체가 빈 상태일 때만 1. 그 화면의 h1이 이 제목이어야 한다.
   * 기본값 2는 화면 일부(표 영역 등)가 비었을 때를 가정한다. ErrorState와 같은 규약이다.
   */
  headingLevel?: 1 | 2
}

function isLinkAction(
  action: EmptyStateProps['action'],
): action is { label: string; to: string; state?: unknown } {
  return typeof action === 'object' && action !== null && 'to' in action && 'label' in action
}

/** 빈 목록·성공·오류처럼 내용 대신 상황을 알리는 자리를 펭귄과 한두 문장으로 채운다. 오류의 원인을 학습자 탓으로 쓰지 않는다. */
export function EmptyState({
  title,
  description,
  action,
  pose = 'empty',
  verdict,
  mascot = true,
  mascotSize = 136,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2'

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
      {mascot ? <Mascot pose={pose} size={mascotSize} /> : null}
      {verdict ? <Verdict verdict={verdict} className="mt-2" /> : null}
      <Heading
        className={
          headingLevel === 1
            ? 'page-title mt-2'
            : 'text-foreground mt-2 text-lg leading-[1.45] font-bold tracking-[-0.01em]'
        }
      >
        {title}
      </Heading>
      {description ? (
        <p className="text-muted-foreground mb-2 max-w-[360px] text-[15px] leading-[1.6]">
          {description}
        </p>
      ) : null}
      {isLinkAction(action) ? (
        <Button asChild className="min-h-11">
          <Link to={action.to} state={action.state}>
            {action.label}
          </Link>
        </Button>
      ) : (
        (action ?? null)
      )}
    </div>
  )
}
