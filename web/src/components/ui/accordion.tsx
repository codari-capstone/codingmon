import { Accordion as AccordionPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

import { Icon } from '@/components/ui/icon'

interface AccordionItem {
  value: string
  title: React.ReactNode
  content: React.ReactNode
}

/**
 * 열어 둘 값(`defaultOpen`)은 디자인처럼 배열로 받는다. 하나만 여는 기본 모드에서는 값을 하나까지만
 * 받는다 — 둘을 넘기면 하나가 조용히 버려지므로 타입 오류로 막는다. 여럿을 열려면 `multiple`.
 */
type AccordionProps = {
  items: AccordionItem[]
  className?: string
} & ({ multiple: true; defaultOpen?: string[] } | { multiple?: false; defaultOpen?: [] | [string] })

/**
 * 제목을 누르면 내용이 펼쳐지는 접이식 목록(자주 묻는 질문, 풀이 해설의 단계, 설정 묶음).
 * 꼭 읽어야 하는 내용을 접어 두지 않고, 접힌 안에 다시 접이식을 넣지 않는다.
 * 열고 닫는 동작·키보드·aria는 radix가 맡는다.
 */
export function Accordion(props: AccordionProps) {
  const { items, className } = props
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

  return props.multiple ? (
    <AccordionPrimitive.Root
      type="multiple"
      defaultValue={props.defaultOpen}
      className={cn(className)}
    >
      {list}
    </AccordionPrimitive.Root>
  ) : (
    <AccordionPrimitive.Root
      type="single"
      collapsible
      defaultValue={props.defaultOpen?.[0]}
      className={cn(className)}
    >
      {list}
    </AccordionPrimitive.Root>
  )
}
