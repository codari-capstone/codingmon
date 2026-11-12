import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from 'cn'
import { Slot } from 'radix-ui'

// 디자인 시스템 Button (docs/design-handoff/design-system/components/Button). 모든 버튼은 알약이다.
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2 rounded-full border-0 font-semibold whitespace-nowrap transition-[background-color,box-shadow,translate,scale,color] duration-150 select-none outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-3 focus-visible:outline-ring active:not-disabled:scale-[.97] disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled-foreground disabled:shadow-none aria-busy:cursor-progress motion-reduce:transition-none motion-reduce:active:scale-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[18px]",
  {
    variants: {
      variant: {
        // 화면의 주 동작 하나. 한 영역에 둘을 두지 않는다
        primary:
          'bg-primary text-primary-foreground hover:not-disabled:-translate-y-px hover:not-disabled:bg-primary-hover hover:not-disabled:shadow-glow active:not-disabled:shadow-none',
        // 흰 면 + 머리카락 선. 다크 모드는 면과 바탕이 거의 같아(1.15:1) 선이 경계를 맡아야 해서
        // 선(--border 1.8:1) 대신 --input(3.2:1 이상)을 쓴다. 쌍은 index.css.test.ts에 있다
        secondary:
          'bg-card text-foreground shadow-[inset_0_0_0_1px_var(--border)] hover:not-disabled:shadow-[inset_0_0_0_1px_var(--muted-foreground)] dark:shadow-[inset_0_0_0_1px_var(--input)] dark:hover:not-disabled:shadow-[inset_0_0_0_1px_var(--muted-foreground)] aria-expanded:shadow-[inset_0_0_0_1px_var(--muted-foreground)]',
        // 남색 무대(inverse) 위의 보조 동작. 무대 밖에서는 쓰지 않는다
        glass:
          'bg-inverse-raised text-inverse-foreground shadow-[inset_0_0_0_1px_var(--inverse-line)] hover:not-disabled:shadow-[inset_0_0_0_1px_var(--inverse-muted)]',
        // 학습 보조 — 힌트 보기, AI 분석
        soft: 'bg-accent text-primary-text hover:not-disabled:shadow-[inset_0_0_0_1px_var(--primary)]',
        // 축하·보상 순간에만, 한 화면에 하나
        accent:
          'bg-highlight text-highlight-foreground hover:not-disabled:-translate-y-px hover:not-disabled:shadow-[0_10px_28px_-8px_rgba(224,161,11,0.6)]',
        // 흰 바탕에서 primary를 이미 쓴 영역의 두 번째 강조
        dark: 'bg-foreground text-background hover:not-disabled:bg-body-foreground',
        // aria-expanded: 메뉴 트리거(AppHeader 사용자 메뉴)가 열린 동안 hover와 같은 모양으로 열린 자리를 알린다
        ghost:
          'bg-transparent text-body-foreground hover:not-disabled:bg-muted hover:not-disabled:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground',
        // 꽉 찬 면 + on-danger 글자로 바꾸면 놓인 자리(옅은 면)에 따라 글자 대비가 4.5:1 아래로 떨어진다(#250 리뷰).
        // 그래서 올림은 면을 바꾸지 않고 선만 더한다. 쌍은 index.css.test.ts에 있다
        danger:
          'bg-destructive-soft text-destructive-text hover:not-disabled:shadow-[inset_0_0_0_1px_var(--destructive)]',
        link: 'h-auto rounded-[4px] bg-transparent px-0.5 text-primary-text hover:not-disabled:underline hover:not-disabled:decoration-2 hover:not-disabled:underline-offset-4 active:not-disabled:scale-100 disabled:bg-transparent',
      },
      size: {
        sm: "h-control-sm px-[18px] text-[14px] [&_svg:not([class*='size-'])]:size-4",
        md: 'h-control-md px-6 text-[15px]',
        // 글자 링크(link)는 문장 속에 놓이므로 크기를 받지 않는다. tailwind-merge가 h-auto와 h-control-md를 같은 속성으로 알아보지 못해 클래스로는 덮을 수 없다
        none: '',
        lg: "h-control-lg px-8 text-[17px] [&_svg:not([class*='size-'])]:size-5",
      },
      // 아이콘만 쓰는 둥근 버튼. aria-label을 함께 준다
      shape: {
        pill: '',
        circle: 'aspect-square px-0',
      },
      fullWidth: {
        true: 'flex w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      shape: 'pill',
      fullWidth: false,
    },
  },
)

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
    /** 기다리는 동안 누르지 못하게 하고 돌아가는 아이콘을 보인다. asChild와는 함께 쓰지 않는다 */
    loading?: boolean
  }

function Button({
  className,
  variant,
  size,
  shape,
  fullWidth,
  asChild = false,
  loading = false,
  type,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const classes = cn(
    buttonVariants({
      variant,
      size: variant === 'link' ? 'none' : size,
      shape,
      fullWidth,
      className,
    }),
  )
  if (asChild) {
    return (
      <Slot.Root
        data-slot="button"
        data-variant={variant ?? 'primary'}
        data-size={size ?? 'md'}
        className={classes}
        // 자식이 버튼 계열 컴포넌트면 type·disabled가 그대로 가야 한다
        {...{ ...props, type, disabled }}
      >
        {children}
      </Slot.Root>
    )
  }
  return (
    <button
      data-slot="button"
      data-variant={variant ?? 'primary'}
      data-size={size ?? 'md'}
      // 폼 안에서 type 없는 button은 submit이 된다(#149). 제출 버튼만 type="submit"을 적는다
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={classes}
      {...props}
    >
      {loading && <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" />}
      {children}
    </button>
  )
}

export { Button, buttonVariants }
