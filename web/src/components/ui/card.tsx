import { createElement } from 'react'
import { cn } from 'cn'

const TONE = {
  default: 'bg-card border',
  subtle: 'bg-muted border border-transparent',
  elevated: 'bg-card border border-transparent shadow-card dark:border-border',
  // 반전 패널은 페이지에 하나뿐인 큰 무대다
  inverse:
    'bg-inverse text-inverse-foreground rounded-[var(--radius-2xl)] border border-transparent dark:border-border',
} as const
const PADDING = { sm: 'p-4', md: 'p-6', lg: 'p-8' } as const

type CardProps = React.HTMLAttributes<HTMLElement> & {
  /** 기본 default. 선 · 옅은 면 · 그림자로 띄움 · 남색 무대 */
  tone?: keyof typeof TONE
  /** 기본 md. sm 16 · md 24 · lg 32 */
  padding?: keyof typeof PADDING
  /** 카드 전체가 링크일 때. 올리면 그림자가 생기며 4px 떠오른다 */
  interactive?: boolean
  as?: 'div' | 'a' | 'section' | 'article'
  href?: string
}

/** 내용을 묶는 면. 카드에 그림자를 상시로 주지 않고, 반전 패널은 한 화면에 하나만 둔다. */
export function Card({
  tone = 'default',
  padding = 'md',
  interactive,
  as = 'div',
  className,
  ...props
}: CardProps) {
  return createElement(as, {
    ...props,
    className: cn(
      'text-body-foreground rounded-lg',
      TONE[tone],
      PADDING[padding],
      interactive &&
        'hover:shadow-hover focus-visible:outline-ring cursor-pointer transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
      className,
    ),
  })
}
