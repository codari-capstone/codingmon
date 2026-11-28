import { createElement } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

const TONE = {
  default: 'bg-card border',
  subtle: 'bg-muted border border-transparent',
  elevated: 'bg-card border border-transparent shadow-card dark:border-border',
  // 반전 패널은 페이지에 하나뿐인 큰 무대다
  inverse:
    'bg-inverse text-inverse-foreground rounded-[var(--radius-2xl)] border border-transparent dark:border-border',
} as const
const PADDING = { sm: 'p-4', md: 'p-6', lg: 'p-8' } as const

// Tailwind 4의 -translate-y-*는 transform이 아니라 translate 속성을 바꾼다. 목록에 없으면 위치가 한 번에 튄다
const INTERACTIVE =
  'hover:shadow-hover focus-visible:outline-ring cursor-pointer transition-[border-color,box-shadow,translate] duration-200 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0'

interface CardStyle {
  /** 기본 default. 선 · 옅은 면 · 그림자로 띄움 · 남색 무대 */
  tone?: keyof typeof TONE
  /** 기본 md. sm 16 · md 24 · lg 32 */
  padding?: keyof typeof PADDING
}

/**
 * 카드 전체가 링크일 때만 `as="a"`와 `href`를 준다. 앱 안 주소라 react-router Link로 그린다 —
 * 일반 <a>면 문서를 다시 불러와 쿼리 캐시와 메모리의 access token이 사라진다.
 * `interactive`(올리면 그림자 + 4px 떠오름)는 링크 카드에만 둔다. 링크가 아닌 면은 키보드로 닿지 않는다.
 */
type CardProps = CardStyle &
  (
    | (React.HTMLAttributes<HTMLElement> & {
        as?: 'div' | 'section' | 'article'
        href?: never
        interactive?: never
      })
    | (Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
        as: 'a'
        href: string
        interactive?: boolean
      })
  )

/** 내용을 묶는 면. 카드에 그림자를 상시로 주지 않고, 반전 패널은 한 화면에 하나만 둔다. */
export function Card(props: CardProps) {
  const { tone = 'default', padding = 'md', className } = props
  // a는 기본이 inline이라 block을 준다. 없으면 배경·테두리가 줄마다 끊기고 떠오르기도 먹지 않는다
  const base = cn('text-body-foreground block rounded-lg', TONE[tone], PADDING[padding])

  if (props.as === 'a') {
    const { as: _as, tone: _t, padding: _p, interactive, href, className: _c, ...rest } = props
    return <Link {...rest} to={href} className={cn(base, interactive && INTERACTIVE, className)} />
  }
  const { as = 'div', tone: _t, padding: _p, className: _c, ...rest } = props
  return createElement(as, { ...rest, className: cn(base, className) })
}
