import { Inbox, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

interface EmptyStateProps {
  /** 기본값은 받은 편지함 모양. 화면에 맞는 아이콘이 있으면 넘긴다. */
  icon?: LucideIcon
  title: string
  description: string
  /** 다음에 할 행동. 빈 상태는 안내로 끝내지 않고 길을 알려 준다 (UX-03). */
  action?: { label: string; to: string }
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: EmptyStateProps) {
  return (
    <div className="bg-muted/40 flex flex-col items-center rounded-xl px-6 py-12 text-center">
      <Icon className="text-muted-foreground/60 mb-4 size-8" aria-hidden="true" />
      <h2 className="text-base font-medium">{title}</h2>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">{description}</p>
      {action ? (
        <Button asChild className="mt-5 min-h-11">
          <Link to={action.to}>{action.label}</Link>
        </Button>
      ) : null}
    </div>
  )
}
