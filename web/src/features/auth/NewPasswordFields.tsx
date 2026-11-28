import { Field, Input } from '@/components/ui/input'

/** 가입(COM-06)과 재설정(COM-08)이 같은 두 칸을 쓴다. 규칙 문구와 불일치 문구가 두 화면에서 같아야 한다 */
export function NewPasswordFields({
  label,
  password,
  passwordConfirm,
  onPassword,
  onPasswordConfirm,
}: {
  /** '비밀번호' 또는 '새 비밀번호'. 확인 칸은 뒤에 ' 확인'을 붙인다 */
  label: string
  password: string
  passwordConfirm: string
  onPassword: (next: string) => void
  onPasswordConfirm: (next: string) => void
}) {
  const mismatch = passwordConfirm.length > 0 && password !== passwordConfirm
  return (
    <>
      <Field
        label={label}
        htmlFor="password"
        hint="10~20자, 영문 대문자·소문자·숫자·특수문자를 각각 하나 이상"
      >
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => onPassword(event.target.value)}
        />
      </Field>
      <Field
        label={`${label} 확인`}
        htmlFor="passwordConfirm"
        // 첫 글자부터 '불일치'라 입력 중에 끼어든다. 예전처럼 읽히지 않게 둔다(#284 리뷰)
        announceError={false}
        error={
          mismatch ? '비밀번호 확인이 일치하지 않아요. 같은 비밀번호를 입력해 주세요' : undefined
        }
      >
        <Input
          id="passwordConfirm"
          type="password"
          autoComplete="new-password"
          value={passwordConfirm}
          onChange={(event) => onPasswordConfirm(event.target.value)}
        />
      </Field>
    </>
  )
}
