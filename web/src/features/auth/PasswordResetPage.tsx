import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'

import { ListSkeleton } from '@/components/ListSkeleton'
import { Button } from '@/components/ui/button'
import { isValidPassword, PASSWORD_CHANGED_NOTICE } from './accountRules'
import { AUTH_CARD, AUTH_FOOT, AUTH_LINK } from './authCard'
import { EmailCodeStep } from './EmailCodeStep'
import { NewPasswordFields } from './NewPasswordFields'
import { problemCode, problemMessage } from './problemCode'
import { resetPassword, sendResetCode, verifyResetCode } from './passwordResetQuery'
import { useAuth } from './useAuth'

/**
 * 비밀번호 재설정 (COM-08).
 *
 * 이메일 → 인증번호 → 새 비밀번호. 성공하면 모든 기기에서 로그아웃된다(계약).
 * 위 안내는 그 사실을 적지 않는다 — 명세 COM-08이 그렇게 정했다(#113). 재설정한 사람은
 * 바로 다시 로그인하므로 할 일이 달라지지 않고, 다른 기기는 토큰 갱신이 실패해 로그인
 * 화면으로 가며 드러난다.
 *
 * 비로그인 화면이라 비울 캐시가 없다. 로그인한 사람은 아래에서 되돌려보낸다.
 */
export function Component() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated, isLoading } = useAuth()

  // RequireAuth가 로그인 화면으로 보낼 때 실어 준 원래 목적지. 비밀번호를 바꾸고 로그인
  // 화면으로 넘길 때 그대로 다시 실어, 로그인하면 들어오려던 화면으로 간다. 값은 로그인
  // 화면이 safeRedirect로 검사한다.
  const from = (location.state as { from?: unknown } | null)?.from

  const [resetToken, setResetToken] = useState<string | null>(null)
  const [emailStepKey, setEmailStepKey] = useState(0)
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const submit = useMutation({
    mutationFn: () => resetPassword({ resetToken: resetToken ?? '', password, passwordConfirm }),
    onSuccess: () => {
      void navigate('/login', { replace: true, state: { notice: PASSWORD_CHANGED_NOTICE, from } })
    },
    onError: (error) => {
      // 증명서가 죽었거나 이미 쓰였다. 인증번호부터 다시 받아야 한다.
      // 규칙 오류(INVALID_PASSWORD·PASSWORD_MISMATCH·SAME_PASSWORD)는 계약이 "resetToken을 쓰지 않으므로
      // 비밀번호만 고쳐 같은 resetToken으로 다시 보낼 수 있다"고 적는다. 그때는 버리지 않는다.
      if (problemCode(error) === 'RESET_EXPIRED') {
        setResetToken(null)
        // EmailCodeStep은 "인증됨" 표시를 스스로 들고 있어 부모가 증명서를 버려도 그대로 남는다.
        // key를 바꿔 새로 마운트하면 이메일 단계가 처음 상태로 돌아간다. 이때 입력해 둔 이메일이
        // 지워지고 재발송 쿨다운도 풀린다. 쿨다운이 풀려도 괜찮은 이유: 이메일당 1분 간격은
        // 서버가 지키고 TOO_MANY_REQUESTS와 그 문구를 EmailCodeStep이 보여 준다. 화면의
        // 카운트다운은 편의일 뿐 통제가 아니다.
        setEmailStepKey((current) => current + 1)
      }
    },
  })

  // 세션을 모르는 동안 폼을 보여 주면, 이미 로그인한 사람이 입력을 시작한 뒤 아래
  // <Navigate>가 실행돼 입력이 사라진 채 이동한다 (LoginPage와 같은 선택).
  if (isLoading) return <ListSkeleton rows={4} />
  if (isAuthenticated) return <Navigate to="/problems" replace />

  const ready = resetToken !== null && isValidPassword(password) && password === passwordConfirm

  return (
    <section className={AUTH_CARD}>
      <div className="flex flex-col gap-1.5">
        <h1 className="page-title">비밀번호 찾기</h1>
        <p className="text-muted-foreground m-0 text-[15px] leading-[1.6]">
          가입한 이메일로 인증번호를 보내 드려요. 인증하면 새 비밀번호를 정할 수 있어요.
        </p>
      </div>

      <EmailCodeStep
        key={emailStepKey}
        sendCode={sendResetCode}
        verifyCode={verifyResetCode}
        // 빈 토큰은 "인증을 되돌렸다"는 신호다(이메일 바꾸기). 들고 있던 증명서를 버린다.
        busy={submit.isPending}
        onVerified={(token) => {
          setResetToken(token || null)
          // 다시 인증했다면 재설정 실패 문구(만료)가 설명하던 상태는 끝났다. 다만 재설정
          // 요청이 오가는 중이면 지우지 않는다 — reset()이 '진행 중'까지 지워 [재설정]이
          // 다시 켜지고, 두 번째 요청은 RESET_EXPIRED를 받는다 (SignupPage와 같은 이유).
          if (token && !submit.isPending) submit.reset()
        }}
      />

      <NewPasswordFields
        label="새 비밀번호"
        password={password}
        passwordConfirm={passwordConfirm}
        onPassword={setPassword}
        onPasswordConfirm={setPasswordConfirm}
      />

      {submit.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {problemMessage(submit.error)}
        </p>
      ) : null}

      {/* isPending 동안 끈다. 두 번 누르면 두 번째는 RESET_EXPIRED를 받아, 바뀐 사람에게 실패 문구가 뜬다. */}
      <Button
        type="button"
        size="lg"
        className="min-h-11"
        disabled={!ready || submit.isPending}
        onClick={() => submit.mutate()}
      >
        {submit.isPending ? '바꾸는 중…' : '재설정'}
      </Button>

      <p className={AUTH_FOOT}>
        {/* 들어오려던 화면을 그대로 싣는다. 로그인하면 거기로 간다 */}
        <Link to="/login" state={{ from }} className={AUTH_LINK}>
          로그인으로 돌아가기
        </Link>
      </p>
    </section>
  )
}
