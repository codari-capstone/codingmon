import { cn } from '@/lib/utils'

import { Icon } from '@/components/ui/icon'

interface Step {
  label: string
  description?: string
}

interface StepperProps {
  /** 2~5개 */
  steps: Step[]
  /** 0부터. 그 앞은 완료로 표시된다 */
  current?: number
  /** 좁은 곳·설명이 긴 곳은 vertical. 기본 horizontal */
  orientation?: 'horizontal' | 'vertical'
  className?: string
}

/**
 * 순서가 있는 과정에서 지금 몇 번째인지 보여 주는 단계 표시(힌트 3단계, 처음 안내).
 * 순서가 없는 선택지에는 Tabs를 쓰고, 여섯 단계를 넘기지 않는다.
 */
export function Stepper({
  steps,
  current = 0,
  orientation = 'horizontal',
  className,
}: StepperProps) {
  const vertical = orientation === 'vertical'
  return (
    <ol className={cn('m-0 flex list-none p-0', vertical ? 'flex-col' : 'gap-2', className)}>
      {steps.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        const last = i === steps.length - 1
        return (
          <li
            key={i}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'relative flex',
              vertical ? 'flex-row gap-3 pb-6' : 'flex-1 flex-col gap-2.5',
            )}
          >
            {last ? null : (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute rounded-sm',
                  state === 'done' ? 'bg-primary' : 'bg-border',
                  vertical
                    ? 'top-9 bottom-1 left-[15px] w-0.5'
                    : 'top-[15px] right-0 left-10 h-0.5',
                )}
              />
            )}
            <span
              data-step-dot=""
              className={cn(
                // 고대비에서는 배경·그림자가 지워져 원이 사라진다. 원은 테두리로, 현재 단계는 바깥 띠로 남긴다
                'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold forced-colors:border',
                state === 'done' && 'bg-primary text-primary-foreground',
                state === 'current' &&
                  'bg-card text-primary-text shadow-[inset_0_0_0_2px_var(--primary),0_0_0_4px_var(--accent)] forced-colors:outline-2 forced-colors:outline-offset-2 forced-colors:outline-solid',
                state === 'todo' && 'bg-muted text-muted-foreground',
              )}
            >
              {state === 'done' ? (
                <Icon name="check" size={14} className="[&_path]:stroke-[3]" />
              ) : (
                i + 1
              )}
            </span>
            <span className={cn('flex flex-col gap-0.5 pr-2', vertical && 'pt-[5px]')}>
              <span
                className={cn(
                  'text-sm leading-[1.4] font-semibold',
                  state === 'todo' ? 'text-muted-foreground' : 'text-foreground',
                )}
              >
                {s.label}
              </span>
              {s.description ? (
                <span className="text-muted-foreground text-[13px] leading-[1.4]">
                  {s.description}
                </span>
              ) : null}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
