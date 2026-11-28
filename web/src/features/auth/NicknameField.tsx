import type { RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldHint, FieldRow, Input } from '@/components/ui/input'
import { isValidNickname } from './accountRules'
import { WRAP_ROW } from './authCard'
import { problemMessage } from './problemCode'
import type { NicknameCheck } from './useNicknameCheck'

/**
 * 닉네임 입력칸과 중복 확인 (COM-02·COM-06 공통).
 *
 * 규칙 문구를 칸 아래에 둔다 — 규칙에 안 맞으면 [중복 확인]이 꺼지는데, 이유가 화면에
 * 없으면 죽은 버튼으로 보인다.
 *
 * @param busy 제출 요청이 오가는 중. 그때는 확인도 끈다 — 응답 순서에 따라 화면이
 *   모순된 상태가 된다.
 * @param skipReason 확인 없이 저장할 수 있는 까닭(마이페이지에서 대소문자만 바꿀 때, MY-02).
 *   있으면 [중복 확인]을 끄고 이 문구를 보여 준다.
 */
export function NicknameField({
  check,
  inputRef,
  busy,
  skipReason = null,
}: {
  check: NicknameCheck
  inputRef: RefObject<HTMLInputElement | null>
  busy: boolean
  skipReason?: string | null
}) {
  return (
    <div className="flex flex-col gap-2">
      {/* 입력 + 버튼 한 줄, 버튼은 입력칸 바닥에 맞춘다(디자인 cm-field-row). 좁으면 버튼이 아래로 내려간다 */}
      <FieldRow className={WRAP_ROW}>
        <Field label="닉네임" htmlFor="nickname">
          <Input
            id="nickname"
            ref={inputRef}
            aria-describedby="nickname-hint"
            value={check.value}
            onChange={(event) => check.change(event.target.value)}
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          className="shrink-0"
          disabled={!isValidNickname(check.value) || check.pending || busy || skipReason !== null}
          onClick={() => check.check()}
        >
          중복 확인
        </Button>
      </FieldRow>
      <FieldHint id="nickname-hint">2~16자, 한글·영문·숫자</FieldHint>
      {skipReason !== null ? <FieldHint className="text-foreground">{skipReason}</FieldHint> : null}
      {check.ok ? <FieldHint className="text-success-text">쓸 수 있어요</FieldHint> : null}
      {check.taken ? <FieldError>이미 사용 중인 닉네임이에요</FieldError> : null}
      {check.error !== null ? <FieldError>{problemMessage(check.error)}</FieldError> : null}
    </div>
  )
}
