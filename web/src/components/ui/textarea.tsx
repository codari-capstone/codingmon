import { cn } from 'cn'

import { FIELD_BOX } from '@/components/ui/input'

/** 여러 줄 글. 코드 편집에는 쓰지 않는다(에디터를 쓴다). 예제 입출력처럼 글자 폭이 같아야 하면 className에 font-mono */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(FIELD_BOX, 'min-h-24 py-3 leading-normal', className)}
      {...props}
    />
  )
}

export { Textarea }
