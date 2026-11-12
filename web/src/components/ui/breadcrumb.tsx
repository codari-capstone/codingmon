import { Link } from 'react-router'
import { cn } from 'cn'

import { Icon } from '@/components/ui/icon'

interface BreadcrumbItem {
  label: string
  /** 마지막(현재 화면)은 href 없이 */
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

/** 지금 화면이 어디에 속하는지 보여 주는 경로. 화면 제목 위에 두고, 두 단계뿐이면 쓰지 않으며 네 단계를 넘기지 않는다. */
export function Breadcrumb({ items, className }: BreadcrumbProps) {
  return (
    <nav aria-label="현재 위치" className={className}>
      <ol className="text-muted-foreground m-0 flex list-none flex-wrap items-center gap-1.5 p-0 text-sm font-medium">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${i}-${item.label}`} className="inline-flex items-center gap-1.5">
              {last || !item.href ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn(last && 'text-foreground font-semibold')}
                >
                  {item.label}
                </span>
              ) : (
                <Link
                  to={item.href}
                  className="hover:text-primary-text focus-visible:outline-ring rounded-sm underline-offset-[3px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  {item.label}
                </Link>
              )}
              {last ? null : <Icon name="chevron-right" size={14} />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
