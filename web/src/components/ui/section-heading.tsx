import { cn } from 'cn'

interface SectionHeadingProps {
  /** 두 줄이면 `\n`으로 끊는다. 세 줄을 넘기지 않는다 */
  title: React.ReactNode
  /** 10자 안팎. 제목과 같은 말을 반복하지 않는다 */
  eyebrow?: React.ReactNode
  /** 핵심 단어는 `<b>`로 감싸면 굵고 진하게 나온다 */
  description?: React.ReactNode
  /** Button 한두 개 */
  actions?: React.ReactNode
  align?: 'start' | 'center'
  /** 앱 화면 머리말은 sm(제목 28px) */
  size?: 'md' | 'sm'
  /** 제목 태그. 기본 h2 */
  as?: 'h1' | 'h2' | 'h3'
  className?: string
}

/** 섹션의 시작을 알리는 머리말: 색 소제목 + 큰 제목 + 설명 + 버튼 묶음. 한 섹션에 둘 쓰지 않는다. */
export function SectionHeading({
  title,
  eyebrow,
  description,
  actions,
  align = 'start',
  size = 'md',
  as: Tag = 'h2',
  className,
}: SectionHeadingProps) {
  return (
    <header
      className={cn(
        'flex max-w-[720px] flex-col gap-3',
        align === 'center' && 'mx-auto items-center text-center',
        className,
      )}
    >
      {eyebrow ? (
        <p className="text-primary-text text-eyebrow m-0 [.bg-inverse_&]:text-inverse-accent">
          {eyebrow}
        </p>
      ) : null}
      <Tag
        className={cn(
          'text-foreground m-0 font-bold tracking-[-0.02em] whitespace-pre-line [.bg-inverse_&]:text-inverse-foreground',
          size === 'sm' ? 'text-title-2' : 'text-title-1',
        )}
      >
        {title}
      </Tag>
      {description ? (
        <p className="text-muted-foreground text-body-lg mt-1 [.bg-inverse_&]:text-inverse-muted [&_b]:text-foreground [&_b]:font-semibold [.bg-inverse_&_b]:text-inverse-foreground">
          {description}
        </p>
      ) : null}
      {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
    </header>
  )
}
