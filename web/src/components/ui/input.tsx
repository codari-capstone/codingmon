import { cloneElement, isValidElement } from 'react'
import { cn } from '@/lib/utils'

/**
 * 상자형 입력칸 (디자인 시스템 Input). 높이 48px, 1.5px 테두리(--input = border-strong), 반지름 12px, 좌우 18px.
 * 테두리 색(--input)이 입력칸 경계 3:1을 맡고, 포커스는 테두리가 --ring이 되며 옅은 후광(shadow-focus)이 퍼진다.
 * 오류는 aria-invalid로 알린다 — 테두리와 후광이 위험색이 된다. 색만으로 알리지 않도록 오류 문구(Field의 error)를 함께 둔다.
 *
 * select·textarea도 이 값을 쓴다(@/components/ui/select, textarea). 한 줄이 아닌 칸은 h-auto로 높이를 푼다.
 */
export const FIELD_BOX =
  'border-input bg-card text-foreground placeholder:text-muted-foreground hover:not-disabled:not-focus-visible:border-muted-foreground focus-visible:border-ring focus-visible:shadow-focus aria-invalid:border-destructive aria-invalid:focus-visible:shadow-[0_0_0_4px_var(--destructive-soft)] disabled:border-border disabled:bg-muted disabled:text-disabled-foreground w-full min-w-0 rounded-md border-[1.5px] px-[18px] text-[15px] transition-[border-color,box-shadow] outline-none disabled:cursor-not-allowed'

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(FIELD_BOX, 'h-control-md', className)}
      {...props}
    />
  )
}

/** 입력칸 하나를 children으로 받았을 때 도움말·오류 문구를 aria-describedby로 잇는다. 그래야 포커스할 때 스크린 리더가 문구도 읽는다 */
function withFieldAria(
  children: React.ReactNode,
  describedBy: string | undefined,
  invalid: boolean,
) {
  if (!isValidElement<{ 'aria-describedby'?: string; 'aria-invalid'?: boolean }>(children))
    return children
  const own = children.props['aria-describedby']
  return cloneElement(children, {
    'aria-describedby': [own, describedBy].filter(Boolean).join(' ') || undefined,
    ...(invalid ? { 'aria-invalid': true } : {}),
  })
}

/**
 * 라벨·도움말·오류 문구가 붙은 칸. 라벨은 칸 바깥 선에, 도움말과 오류는 칸 안 글자 시작점(왼쪽 18px)에 맞춘다.
 * 입력칸 옆에 버튼이 붙는 칸은 hint를 여기 넣지 말고 FieldRow 아래에 FieldHint로 따로 둔다.
 * 그래야 버튼이 도움말 바닥이 아니라 입력칸 바닥에 맞는다.
 */
function Field({
  label,
  htmlFor,
  hint,
  error,
  announceError = true,
  className,
  children,
}: {
  label: React.ReactNode
  /** children의 입력칸 id. 라벨을 눌러도 포커스가 가고 스크린 리더가 라벨을 읽는다 */
  htmlFor: string
  hint?: React.ReactNode
  error?: React.ReactNode
  /**
   * 오류를 role="alert"로 바로 읽힐지. 입력하는 동안 바뀌는 검사(비밀번호 확인 불일치)나
   * 한 번에 여러 칸이 뜨는 검사는 끈다 — 칸에 포커스하면 aria-describedby로 읽힌다.
   */
  announceError?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div data-slot="field" className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={htmlFor} className="text-sm leading-[1.4] font-semibold text-foreground">
        {label}
      </label>
      {withFieldAria(
        children,
        error ? `${htmlFor}-error` : hint ? `${htmlFor}-hint` : undefined,
        !!error,
      )}
      {error ? (
        <FieldError id={`${htmlFor}-error`} role={announceError ? 'alert' : undefined}>
          {error}
        </FieldError>
      ) : null}
      {hint && !error ? <FieldHint id={`${htmlFor}-hint`}>{hint}</FieldHint> : null}
    </div>
  )
}

function FieldHint({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'm-0 pl-[18px] text-[13px] leading-[1.4] font-medium text-muted-foreground',
        className,
      )}
      {...props}
    />
  )
}

function FieldError({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      role="alert"
      className={cn(
        'm-0 pl-[18px] text-[13px] leading-[1.4] font-semibold text-destructive-text',
        className,
      )}
      {...props}
    />
  )
}

/** 입력칸 + 버튼을 한 줄에 두고 바닥을 맞춘다(중복 확인, 인증번호 받기). 도움말은 이 줄 아래 FieldHint로 */
function FieldRow({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex items-end gap-2 [&>[data-slot=field]]:min-w-0 [&>[data-slot=field]]:flex-1',
        className,
      )}
      {...props}
    />
  )
}

export { Input, Field, FieldHint, FieldError, FieldRow }
