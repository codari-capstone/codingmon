import { ChevronDown } from 'lucide-react'
import { cn } from 'cn'

import { FIELD_BOX } from '@/components/ui/input'

/**
 * 브라우저 기본 select를 Input 모양으로 입힌 것. 선택지는 <option>을 children으로 준다.
 * 선택지가 둘셋이면 RadioGroup이나 분절형 Tabs, 동작 목록이면 dropdown-menu를 쓴다.
 * className은 select가 아니라 감싸는 요소에 간다(폭을 주는 자리).
 */
function Select({ className, children, ...props }: React.ComponentProps<'select'>) {
  return (
    <div className={cn('relative w-full', className)}>
      <select
        data-slot="select"
        className={cn(FIELD_BOX, 'h-control-md appearance-none pr-11')}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 size-[18px] -translate-y-1/2 text-muted-foreground"
      />
    </div>
  )
}

export { Select }
