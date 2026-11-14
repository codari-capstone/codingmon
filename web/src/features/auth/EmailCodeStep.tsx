import { useMutation } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldHint, FieldRow, Input } from '@/components/ui/input'
import { CODE_LENGTH, EMAIL_PATTERN, INVALID_EMAIL_MESSAGE, isValidCode } from './accountRules'
import { WRAP_ROW } from './authCard'
import { problemCode, problemMessage } from './problemCode'
import { useResendCooldown } from './useResendCooldown'

/** 재발송 쿨다운. 발송 제한이 같은 이메일 1분 간격이다 (계정 규칙). */
const RESEND_SECONDS = 60

interface EmailCodeStepProps {
  sendCode: (email: string) => Promise<void>
  verifyCode: (input: { email: string; code: string }) => Promise<string>
  /** 인증이 끝나면 증명서를 올린다. 인증이 풀리면 빈 문자열로 알린다. */
  onVerified: (token: string) => void
  /** 발송 오류 문구 옆에 붙는 동작. 가입의 EMAIL_TAKEN에 [로그인하러 가기]를 붙이는 자리. */
  sendErrorAction?: (code: string | undefined) => ReactNode
  /**
   * 부모가 제출 중일 때 참. 이 단계 전체를 잠근다.
   *
   * 제출이 오가는 동안 [이메일 바꾸기]로 다른 주소를 인증하면, 부모의 onVerified가
   * 제출 상태를 지워 버튼이 다시 켜지고 두 번째 요청이 나간다. 그 창을 닫는다.
   */
  busy?: boolean
}

/**
 * 이메일 → 인증번호 두 단계. 가입(COM-06)과 재설정(COM-08)이 같이 쓴다.
 *
 * 두 화면이 다른 것은 어느 경로로 보내나, 무슨 토큰을 받나, 발송 오류에 무엇을 붙이나
 * 셋뿐이다. 그 셋을 props로 받고, 쿨다운·칸 잠금·오류 표시는 여기 가둔다.
 */
export function EmailCodeStep({
  sendCode,
  verifyCode,
  onVerified,
  sendErrorAction,
  busy = false,
}: EmailCodeStepProps) {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [codeOpen, setCodeOpen] = useState(false)
  const [code, setCode] = useState('')
  const [codeError, setCodeError] = useState<string | null>(null)
  const [verified, setVerified] = useState(false)
  const { remaining, start, reset } = useResendCooldown(RESEND_SECONDS)

  // type="email" 입력은 앞뒤 공백을 HTML 값 정리 규칙으로 이미 떼어 준다. 이 trim은
  // 코드로 넣은 값을 위한 안전망이며, 어떤 UI 테스트로도 실패시킬 수 없어 일부러 테스트로
  // 고정하지 않는다. 한 번만 계산해 발송·확인·부모에게 올리는 값이 서로 같게 한다.
  const trimmedEmail = email.trim()

  const send = useMutation({
    mutationFn: () => sendCode(trimmedEmail),
    onSuccess: () => {
      setCodeOpen(true)
      start()
      // 새 번호를 보냈으니 옛 번호에 딸린 것은 모두 지난 일이다(MAIL_FAILED 분기와 같다).
      // - 확인 실패: 남기면 '다시 받아 주세요'가 계속 보이고 메일함 안내가 다시 나오지 않는다(#284 리뷰)
      // - 칸의 옛 번호: 서버가 이미 무효로 만들었다. 오류 표시 없이 남으면 그대로 눌러 시도 횟수만 준다(#286 리뷰)
      // - 자릿수 오류: 새 발송 안내와 옛 검증 문구가 함께 보인다
      verify.reset()
      setCode('')
      setCodeError(null)
    },
    onError: (error) => {
      const failed = problemCode(error)
      // MAIL_FAILED면 번호 칸을 닫고 입력도 비운다.
      //
      // 서버는 이전 번호를 무효로 만든 뒤 새 번호를 저장하고, 그다음 메일을 보낸다
      // (EmailCodeService.issue → send). 발송이 실패하면 새 번호는 사용자에게 가지 않았고
      // 이전 번호는 이미 죽었다. 칸을 열어 두면 사용자가 옛 번호를 넣어 CODE_MISMATCH를
      // 받고, 받아 본 적 없는 번호에 시도 횟수(5회)만 쌓인다. 계약도 같은 말을 한다 —
      // "번호는 만들어진 채라 1분 뒤 다시 받아야 하고, 하루 5회에도 센다". '만들어진 채'는
      // 하루 횟수에 센다는 뜻이고, 사용자가 할 일은 다시 받기다.
      if (failed === 'MAIL_FAILED') {
        setCodeOpen(false)
        setCode('')
        setCodeError(null)
        verify.reset()
      }
      // 서버가 번호를 만들었거나 횟수에 센 경우만 쿨다운을 돈다 (계정 규칙).
      // - MAIL_FAILED: 번호를 만들었으므로 1분 안에 또 보내면 429다.
      // - TOO_MANY_REQUESTS: 이미 제한에 걸렸다. 언제 풀리는지 모르니 카운트다운과 서버 문구로 보인다.
      // - EMAIL_TAKEN·EMAIL_NOT_FOUND·INVALID_EMAIL: 번호를 보내지 않았다. 가입 여부 조회는
      //   IP 하루 상한에만 세고 이메일당 1분 간격에는 세지 않으므로, 막으면 오타를 고친
      //   사용자가 이유도 모른 채 기다리게 된다.
      if (failed === 'MAIL_FAILED' || failed === 'TOO_MANY_REQUESTS') start()
    },
  })

  const verify = useMutation({
    mutationFn: () => verifyCode({ email: trimmedEmail, code }),
    onSuccess: (token) => {
      setVerified(true)
      setCodeError(null)
      // MAIL_FAILED 뒤에도 번호는 만들어져 있어 인증이 이어진다. 인증됐는데 발송 실패 문구가 남으면 모순이다.
      send.reset()
      onVerified(token)
    },
    onError: (error) => {
      const failed = problemCode(error)
      // 번호가 죽은 경우다. 칸을 비우고 다시 받게 한다.
      if (failed === 'CODE_EXPIRED' || failed === 'CODE_ATTEMPTS_EXCEEDED') setCode('')
    },
  })

  // 확인이 '번호가 죽었다'로 끝났다. 칸도 비워진다(위 verify.onError)
  const verifyFailure = verify.isError ? problemCode(verify.error) : undefined
  const codeDead = verifyFailure === 'CODE_EXPIRED' || verifyFailure === 'CODE_ATTEMPTS_EXCEEDED'

  function handleSend() {
    if (!EMAIL_PATTERN.test(trimmedEmail)) {
      // 서버의 INVALID_EMAIL과 같은 문구다. 명세 '계정 규칙'이 "화면이 보내기 전에 미리
      // 검사할 때도 같은 문구를 쓴다"고 정했다 (#113).
      setEmailError(INVALID_EMAIL_MESSAGE)
      return
    }
    setEmailError(null)
    send.mutate()
  }

  function handleVerify() {
    if (!isValidCode(code)) {
      setCodeError(`인증번호 ${CODE_LENGTH}자리를 입력해 주세요`)
      return
    }
    setCodeError(null)
    verify.mutate()
  }

  /**
   * 주소에 딸린 것을 모두 버린다. 이메일을 고칠 때와 [이메일 바꾸기]를 누를 때 부른다.
   *
   * 번호 칸·입력한 번호·두 요청의 오류 문구·쿨다운·증명서가 모두 "그 주소"에 대한 것이다.
   * 주소가 바뀌면 그중 무엇도 새 주소를 설명하지 못한다. 하나라도 남기면 그게 남는 쪽으로
   * 화면이 거짓말을 한다 — 남은 쿨다운은 기다릴 이유가 없는 60초를, 남은 번호 칸은 새
   * 주소로 옛 번호를 보내 엉뚱한 오류를, 남은 증명서는 화면에 없는 계정을 만든다.
   */
  function clearForEmail() {
    // 형식 오류도 그 주소에 대한 것이다. 주소를 고치는 중에 남아 있으면 사용자는 지금
    // 값에 대한 설명으로 읽는다. 공백만 바뀐 경우는 여기 오지 않는다 — 그때는 보내는
    // 주소가 그대로라 형식 판정도 그대로다.
    setEmailError(null)
    setCodeOpen(false)
    setCode('')
    setCodeError(null)
    send.reset()
    verify.reset()
    // 제한은 이메일마다 따로 센다. 다른 주소가 이전 주소의 쿨다운을 물려받으면 안 된다.
    // 원래 주소로 되돌아가 또 보내면 서버가 429로 막고 그 문구와 함께 쿨다운이 다시 돈다.
    reset()
    if (verified) {
      setVerified(false)
      // 부모가 들고 있는 증명서를 버리게 한다. 안 버리면 다른 이메일로 받은 증명서로 가입된다.
      onVerified('')
    }
  }

  function handleEmailInput(next: string) {
    setEmail(next)
    // 공백만 바뀐 경우는 보내는 주소가 그대로다(아래 trimmedEmail). 인증을 풀지 않는다.
    if (next.trim() !== trimmedEmail) clearForEmail()
  }

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-col gap-2">
        {/* 입력 + 버튼 한 줄, 버튼은 입력칸 바닥에 맞춘다(디자인 cm-field-row). 좁으면 버튼이 아래로 내려간다 */}
        <FieldRow className={WRAP_ROW}>
          {/*
            요청이 오가는 동안에도 잠근다. 보낸 주소와 화면의 주소가 갈라지면, 응답이
            지금 입력값에 대한 것인지 알 수 없다. 확인 요청 중에 주소를 B로 고치면 A용
            증명서를 쥔 채 B가 인증된 것처럼 잠겨, 화면에 없는 A 계정이 처리된다.
            잠그는 동안 두 버튼도 꺼져 있어 사용자가 할 수 있는 일은 달라지지 않는다.
          */}
          <Field label="이메일" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              readOnly={verified || busy || send.isPending || verify.isPending}
              value={email}
              onChange={(event) => handleEmailInput(event.target.value)}
            />
          </Field>
          {verified ? (
            <Button type="button" variant="secondary" disabled={busy} onClick={clearForEmail}>
              이메일 바꾸기
            </Button>
          ) : (
            <Button
              type="button"
              variant="secondary"
              // 꺼진 글자색(disabled-foreground)은 읽지 않는 글자용이다. 카운트다운은 읽어야 하는 글자라 대비가 나은 색을 쓴다
              className="shrink-0 disabled:text-muted-foreground"
              // 확인 요청과 겹치지 않게 막는다. 겹치면 서버가 이전 번호를 무효로 만든 뒤
              // 확인이 도착해 CODE_MISMATCH가 되거나, 늦게 온 발송 성공이 비워 둔 칸을
              // 다시 열고 쿨다운을 돌린다.
              disabled={busy || send.isPending || verify.isPending || remaining > 0}
              onClick={handleSend}
            >
              {/* 꺼진 버튼에 이유가 없으면 죽은 버튼으로 보인다. 카운트다운이 그 이유다. */}
              {codeOpen ? '다시 받기' : '인증번호 받기'}
              {remaining > 0 ? ` (${remaining}초)` : ''}
            </Button>
          )}
        </FieldRow>
        {/* 이 칸의 형식 오류는 보내기 전 검사라 지금처럼 읽어 주지 않는다(role 없음) */}
        {emailError ? (
          <FieldError role={undefined} className="font-medium">
            {emailError}
          </FieldError>
        ) : null}
        {send.isError ? (
          <FieldError>
            {problemMessage(send.error)} {sendErrorAction?.(problemCode(send.error))}
          </FieldError>
        ) : null}
        {/*
          디자인: 보낸 뒤 칸 아래 한 줄. 인증을 마치면 할 일이 없어 지운다. 번호가 죽은 경우(만료·횟수 초과)도
          지운다 — 그때는 '다시 받아 주세요'가 뜨는데 '메일함을 확인해 주세요'가 남으면 할 일이 엇갈린다
        */}
        {codeOpen && !verified && !send.isError && !codeDead ? (
          <FieldHint role="status">인증번호를 보냈어요. 메일함을 확인해 주세요.</FieldHint>
        ) : null}
      </div>

      {codeOpen ? (
        <div className="flex flex-col gap-2">
          <FieldRow className={WRAP_ROW}>
            <Field label="인증번호" htmlFor="code">
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder={`${CODE_LENGTH}자리 숫자`}
                maxLength={CODE_LENGTH}
                readOnly={verified || busy || verify.isPending}
                value={code}
                onChange={(event) => {
                  setCode(event.target.value)
                  setCodeError(null)
                  verify.reset()
                }}
              />
            </Field>
            {verified ? (
              <p className="text-success-text flex h-control-md items-center text-sm font-semibold">
                인증됐어요
              </p>
            ) : (
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                disabled={busy || verify.isPending || send.isPending}
                onClick={handleVerify}
              >
                확인
              </Button>
            )}
          </FieldRow>
          {codeError ? (
            <FieldError role={undefined} className="font-medium">
              {codeError}
            </FieldError>
          ) : null}
          {verify.isError ? <FieldError>{problemMessage(verify.error)}</FieldError> : null}
        </div>
      ) : null}
    </div>
  )
}
