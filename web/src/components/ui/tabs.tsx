import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from 'cn'
import { Tabs as TabsPrimitive } from 'radix-ui'

/**
 * 디자인 시스템 Tabs. line은 화면 안 구역 전환(문제 · 에디터), pill은 회색 트랙 위 흰 칩이
 * 움직이는 분절형(목록 필터). 탭으로 페이지 이동을 대신하지 않고, 다섯 개를 넘기지 않는다.
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}

const tabsListVariants = cva('group/tabs-list flex items-center', {
  variants: {
    variant: {
      // 아래 선을 border 대신 안쪽 그림자로 그린다. border면 지금 탭의 밑줄을 그 선 위에 겹치려고
      // 1px 밖으로 내야 하고, overflow-x-auto 목록에서 그 1px가 세로 스크롤로 잡힌다(#257 리뷰)
      line: 'gap-6 shadow-[inset_0_-1px_0_var(--border)]',
      pill: 'inline-flex w-max gap-1 self-start rounded-full bg-muted p-1',
    },
  },
  defaultVariants: { variant: 'line' },
})

function TabsList({
  className,
  variant = 'line',
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // outline-none이 아니라 outline-hidden이다. Tailwind v4의 outline-none은 style을 none으로 고정해
        // focus-visible:outline-2가 그려지지 않는다(#255 리뷰)
        'relative inline-flex shrink-0 items-center justify-center gap-1.5 text-[15px] font-semibold whitespace-nowrap text-muted-foreground transition-[color,background-color,box-shadow] outline-hidden hover:not-disabled:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-disabled-foreground motion-reduce:transition-none',
        // line: 높이 48px, 지금 탭은 파란 글자 + 3px 파란 밑줄(목록의 1px 선 위에 겹친다).
        // 포커스 둥글기는 line에만 준다. pill에 주면 rounded-full을 이겨 칩이 사각형이 된다(#257 리뷰)
        'group-data-[variant=line]/tabs-list:focus-visible:rounded-sm group-data-[variant=line]/tabs-list:h-12 group-data-[variant=line]/tabs-list:px-0.5 group-data-[variant=line]/tabs-list:data-active:font-bold group-data-[variant=line]/tabs-list:data-active:text-primary-text',
        'after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:rounded-t-[3px] after:bg-primary after:opacity-0 group-data-[variant=line]/tabs-list:data-active:after:opacity-100',
        // pill: 높이 36px 알약, 지금 탭은 흰 칩. 다크는 칩 면을 --border로 두고 그림자를 뺀다
        'group-data-[variant=pill]/tabs-list:h-9 group-data-[variant=pill]/tabs-list:rounded-full group-data-[variant=pill]/tabs-list:px-4 group-data-[variant=pill]/tabs-list:text-[14px] group-data-[variant=pill]/tabs-list:data-active:bg-card group-data-[variant=pill]/tabs-list:data-active:font-bold group-data-[variant=pill]/tabs-list:data-active:text-foreground group-data-[variant=pill]/tabs-list:data-active:shadow-[0_1px_2px_rgba(27,33,64,0.08),0_2px_8px_-2px_rgba(27,33,64,0.12)] dark:group-data-[variant=pill]/tabs-list:data-active:bg-border dark:group-data-[variant=pill]/tabs-list:data-active:shadow-none',
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 text-sm outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
