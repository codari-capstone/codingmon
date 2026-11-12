import { Accordion as AccordionPrimitive } from 'radix-ui'
import { cn } from 'cn'

import { Icon } from '@/components/ui/icon'

interface AccordionItem {
  value: string
  title: React.ReactNode
  content: React.ReactNode
}

interface AccordionProps {
  items: AccordionItem[]
  /** 열어 둘 값 */
  defaultOpen?: string[]
  /** 여러 개를 동시에 열 수 있게 한다. 기본은 하나만 */
  multiple?: boolean
  className?: string
}

/**
 * 제목을 누르면 내용이 펼쳐지는 접이식 목록(자주 묻는 질문, 풀이 해설의 단계, 설정 묶음).
 * 꼭 읽어야 하는 내용을 접어 두지 않고, 접힌 안에 다시 접이식을 넣지 않는다.
 * 열고 닫는 동작·키보드·aria는 radix가 맡는다.
 */
export function Accordion({ items, defaultOpen = [], multiple, className }: AccordionProps) {
  const list = items.map((it) => (
    <AccordionPrimitive.Item key={it.value} value={it.value} className="border-b">
      <AccordionPrimitive.Header className="m-0">
        <AccordionPrimitive.Trigger className="text-foreground hover:text-primary-text focus-visible:outline-ring group flex w-full cursor-pointer items-center justify-between gap-4 rounded-sm border-0 bg-transparent px-1 py-5 text-left text-[17px] leading-[1.45] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2">
          <span>{it.title}</span>
          <Icon
            name="chevron-down"
            size={20}
            className="text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 motion-reduce:transition-none"
          />
        </AccordionPrimitive.Trigger>
      </AccordionPrimitive.Header>
      <AccordionPrimitive.Content className="text-body-foreground px-1 pb-5 text-[15px] leading-[1.65]">
        {it.content}
      </AccordionPrimitive.Content>
    </AccordionPrimitive.Item>
  ))

  return multiple ? (
    <AccordionPrimitive.Root type="multiple" defaultValue={defaultOpen} className={cn(className)}>
      {list}
    </AccordionPrimitive.Root>
  ) : (
    <AccordionPrimitive.Root
      type="single"
      collapsible
      defaultValue={defaultOpen[0]}
      className={cn(className)}
    >
      {list}
    </AccordionPrimitive.Root>
  )
}
