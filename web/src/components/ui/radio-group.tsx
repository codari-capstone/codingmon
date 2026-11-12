import { useId } from 'react'
import { cn } from '@/lib/utils'

import {
  CHOICE_BOX,
  CHOICE_INPUT,
  ChoiceText,
  CHOICE_LABEL,
  choiceAria,
  type ChoiceProps,
} from '@/components/ui/checkbox'

/** 라디오 하나. 묶음 제목이 따로 있으면(fieldset·legend) 이것만 써도 된다 */
function Radio({ label, description, className, ...props }: ChoiceProps) {
  const id = useId()
  return (
    <label data-slot="radio" className={cn(CHOICE_LABEL, className)}>
      <input type="radio" className={CHOICE_INPUT} {...choiceAria(id, description)} {...props} />
      <span
        aria-hidden
        className={cn(
          CHOICE_BOX,
          'rounded-full peer-checked:shadow-[inset_0_0_0_6.5px_var(--primary)]',
        )}
      />
      <ChoiceText id={id} label={label} description={description} />
    </label>
  )
}

interface RadioOption<T extends string> {
  value: T
  label: React.ReactNode
  description?: React.ReactNode
  disabled?: boolean
}

/**
 * 여러 선택지(2~5개) 중 하나. 여섯 개를 넘으면 Select, 여러 개를 고르면 Checkbox.
 * card는 선택지에 설명이 붙을 때(온보딩·설정) 카드로 늘어놓는다.
 */
function RadioGroup<T extends string>({
  label,
  name,
  options,
  value,
  onChange,
  variant = 'list',
  className,
}: {
  label: React.ReactNode
  name: string
  options: RadioOption<T>[]
  value: T | undefined
  onChange: (value: T) => void
  variant?: 'list' | 'card'
  className?: string
}) {
  return (
    <fieldset data-slot="radio-group" className={cn('m-0 min-w-0 border-0 p-0', className)}>
      <legend className="mb-3 p-0 text-sm leading-[1.4] font-semibold text-foreground">
        {label}
      </legend>
      <div
        className={
          variant === 'card'
            ? 'grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3'
            : 'flex flex-col'
        }
      >
        {options.map((option) => (
          <Radio
            key={option.value}
            name={name}
            value={option.value}
            label={option.label}
            description={option.description}
            disabled={option.disabled}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className={
              variant === 'card'
                ? 'rounded-md px-4 py-3.5 shadow-[inset_0_0_0_1px_var(--border)] transition-[background-color,box-shadow] has-checked:bg-accent has-checked:shadow-[inset_0_0_0_2px_var(--primary)] [&>input]:top-[15px] [&>input]:left-4'
                : undefined
            }
          />
        ))}
      </div>
    </fieldset>
  )
}

export { Radio, RadioGroup, type RadioOption }
