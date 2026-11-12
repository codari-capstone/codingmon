import { useId } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 디자인 시스템 Checkbox와 Radio의 공통 모양. 네이티브 input을 투명하게 겹쳐 두고 옆의 상자를 꾸민다.
 * 역할·상태·방향키 이동·폼 등록(react-hook-form register)이 모두 네이티브 그대로 따라온다.
 * 44px 터치 영역(WCAG 2.5.5)은 라벨 전체(min-h-11)가 맡는다.
 */
type ChoiceProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  label: React.ReactNode
  description?: React.ReactNode
}

export const CHOICE_LABEL =
  'relative inline-flex min-h-11 cursor-pointer items-start gap-2.5 py-2.5 text-[15px] leading-[1.5] font-medium text-foreground has-disabled:cursor-not-allowed has-disabled:opacity-50'

// 상자 앞의 input이 peer다. 포커스 외곽선은 상자가 그린다.
// 고대비(forced-colors)에서는 브라우저가 box-shadow를 지워 상자 테두리와 라디오 점이 사라진다.
// 그 모드에서는 꾸민 상자를 숨기고 네이티브 input을 드러내 시스템 색으로 그리게 한다
export const CHOICE_INPUT =
  'peer absolute top-[11px] left-0 m-0 size-[22px] cursor-[inherit] opacity-0 forced-colors:static forced-colors:mt-px forced-colors:opacity-100'
export const CHOICE_BOX =
  'mt-px inline-flex size-[22px] shrink-0 items-center justify-center bg-card shadow-[inset_0_0_0_1.5px_var(--input)] transition-[background-color,box-shadow] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-solid peer-focus-visible:outline-ring motion-reduce:transition-none forced-colors:hidden'

/**
 * 라벨 글자와 설명. 설명도 <label> 안에 있어 그대로 두면 이름에 합쳐진다('C++ GCC 13').
 * 설명이 있으면 input이 aria-labelledby로 라벨 글자만 이름으로 잡고, 설명은 aria-describedby로 잇는다.
 * id는 choiceAria와 같은 규칙(`${id}-label`·`${id}-desc`)을 쓴다
 */
export function ChoiceText({
  id,
  label,
  description,
}: {
  id: string
  label: React.ReactNode
  description?: React.ReactNode
}) {
  return (
    <span className="flex flex-col">
      <span id={`${id}-label`}>{label}</span>
      {description ? (
        <span
          id={`${id}-desc`}
          className="text-[13px] leading-[1.5] font-normal text-muted-foreground"
        >
          {description}
        </span>
      ) : null}
    </span>
  )
}

/** ChoiceText와 짝인 input 속성. 설명이 없으면 label이 이름을 맡으니 아무것도 붙이지 않는다 */
export const choiceAria = (id: string, description: React.ReactNode) =>
  description ? { 'aria-labelledby': `${id}-label`, 'aria-describedby': `${id}-desc` } : {}

/** 켜고 끄는 선택 하나. 바로 적용되는 설정에는 Switch, 하나만 고르는 선택지에는 RadioGroup */
function Checkbox({ label, description, className, ...props }: ChoiceProps) {
  const id = useId()
  return (
    <label data-slot="checkbox" className={cn(CHOICE_LABEL, className)}>
      <input type="checkbox" className={CHOICE_INPUT} {...choiceAria(id, description)} {...props} />
      <span
        aria-hidden
        className={cn(
          CHOICE_BOX,
          'rounded-[7px] text-transparent peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:shadow-none',
        )}
      >
        <Check className="size-4" strokeWidth={3} />
      </span>
      <ChoiceText id={id} label={label} description={description} />
    </label>
  )
}

export { Checkbox, type ChoiceProps }
