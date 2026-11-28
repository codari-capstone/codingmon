import { useId } from 'react'
import { cn } from '@/lib/utils'

import { ChoiceText, choiceAria } from '@/components/ui/checkbox'

/**
 * 누르는 즉시 적용되는 설정. 저장 버튼을 눌러야 적용되는 폼에는 Checkbox를 쓴다.
 * 네이티브 checkbox에 role="switch"를 줘 켜짐·꺼짐을 스크린 리더가 '스위치'로 읽는다.
 * 라벨은 왼쪽, 스위치는 오른쪽 끝. 고대비(forced-colors)에서는 트랙이 box-shadow·배경색에 기대므로
 * 숨기고 네이티브 input을 드러낸다 (checkbox.tsx와 같은 이유).
 */
function Switch({
  label,
  description,
  className,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type' | 'role'> & {
  label: React.ReactNode
  description?: React.ReactNode
}) {
  const id = useId()
  return (
    <label
      data-slot="switch"
      className={cn(
        'relative flex min-h-11 cursor-pointer items-center justify-between gap-4 py-2 text-[15px] leading-[1.5] font-medium text-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50',
        className,
      )}
    >
      <ChoiceText id={id} label={label} description={description} />
      <input
        type="checkbox"
        role="switch"
        {...choiceAria(id, description)}
        className="peer absolute top-1/2 right-0 m-0 h-[26px] w-11 -translate-y-1/2 cursor-[inherit] opacity-0 forced-colors:static forced-colors:translate-y-0 forced-colors:opacity-100"
        {...props}
      />
      <span
        aria-hidden
        className="relative h-[26px] w-11 shrink-0 rounded-full bg-input transition-colors duration-200 peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-solid peer-focus-visible:outline-ring after:absolute after:top-[3px] after:left-[3px] after:size-5 after:rounded-full after:bg-white after:shadow-[0_1px_3px_rgba(27,33,64,0.3)] after:transition-transform after:duration-200 peer-checked:after:translate-x-[18px] motion-reduce:transition-none motion-reduce:after:transition-none forced-colors:hidden"
      />
    </label>
  )
}

export { Switch }
