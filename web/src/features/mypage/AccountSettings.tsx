import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import { setAccessToken } from '@/api/session'
import type { CurrentUser } from '@/api/types'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  isValidNickname,
  isValidPassword,
  PASSWORD_CHANGED_NOTICE,
} from '@/features/auth/accountRules'
import { ME_QUERY_KEY } from '@/features/auth/authQuery'
import { NicknameField } from '@/features/auth/NicknameField'
import { problemCode, problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { useNicknameCheck } from '@/features/auth/useNicknameCheck'
import { clearSavedCode } from '@/features/solve/savedCode'
import { changePassword, updateNickname, withdraw } from './myPageQuery'

/**
 * 닉네임 변경 (MY-02). 가입과 같은 [중복 확인]을 쓴다.
 *
 * 대소문자만 바꾸면 확인을 건너뛴다. 중복 확인 API는 누가 묻는지 모르므로 자기 닉네임을
 * '사용 중'이라고 답한다(계약). 저장 시점에 선점됐으면(409) 확인을 풀고 칸으로 돌아간다.
 */
export function NicknameForm({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const check = useNicknameCheck(inputRef)
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: () => updateNickname(check.value),
    onSuccess: (updated) => {
      // 상단 닉네임도 바로 바뀐다(명세). /api/users/me를 다시 묻지 않는다 — 응답이 그 값이다.
      queryClient.setQueryData(ME_QUERY_KEY, updated)
      check.change('')
      setSaved(true)
    },
    onError: (error) => {
      forgetSessionIfUnauthorized(queryClient, error)
      if (problemCode(error) === 'NICKNAME_TAKEN') check.release()
    },
  })

  const value = check.value
  const caseOnly =
    value !== user.nickname &&
    value.toLowerCase() === user.nickname.toLowerCase() &&
    isValidNickname(value)
  const canSave = (check.ok || caseOnly) && value !== user.nickname && !save.isPending

  return (
    <form
      aria-labelledby="nickname-heading"
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) save.mutate()
      }}
    >
      <h3 id="nickname-heading" className="text-base font-semibold">
        닉네임 변경
      </h3>
      <NicknameField
        check={{
          ...check,
          change: (next) => {
            setSaved(false)
            save.reset()
            check.change(next)
          },
        }}
        inputRef={inputRef}
        busy={save.isPending}
        skipReason={caseOnly ? '대소문자만 바뀌어 중복 확인 없이 저장할 수 있어요' : null}
      />
      {value === user.nickname && value.length > 0 ? (
        <p className="text-muted-foreground text-sm">지금 쓰는 닉네임이에요</p>
      ) : null}
      {save.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(save.error)}
        </p>
      ) : null}
      <p role="status" className="text-sm">
        {saved ? '닉네임을 바꿨어요' : null}
      </p>
      <div>
        <Button type="submit" className="min-h-11" disabled={!canSave}>
          저장
        </Button>
      </div>
    </form>
  )
}

function PasswordInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: 'current-password' | 'new-password'
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type="password"
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

/**
 * 비밀번호 변경 (MY-03).
 *
 * 바꾸면 모든 기기에서 로그아웃된다(계약). 이 기기의 토큰과 캐시도 버리고 로그인 화면으로
 * 보내 재설정(COM-08)과 같은 안내를 띄운다. 저장한 풀이 코드는 지우지 않는다 — 같은
 * 사람이 바로 다시 로그인한다(로그아웃·탈퇴와 다른 점).
 *
 * GitHub 가입자에게는 숨기지 않고 비활성 버튼과 이유를 보여 준다(#181).
 */
export function PasswordForm({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('')

  const submit = useMutation({
    mutationFn: () => changePassword({ currentPassword, newPassword, newPasswordConfirm }),
    onSuccess: () => {
      setAccessToken(null)
      void navigate('/login', { replace: true, state: { notice: PASSWORD_CHANGED_NOTICE } })
      queryClient.clear()
    },
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })

  if (user.loginMethod === 'GITHUB') {
    return (
      <div className="flex max-w-sm flex-col gap-3">
        <h3 className="text-base font-semibold">비밀번호 변경</h3>
        <p className="text-muted-foreground text-sm">GitHub로 로그인한 계정은 비밀번호가 없어요</p>
        <div>
          <Button className="min-h-11" disabled>
            비밀번호 변경
          </Button>
        </div>
      </div>
    )
  }

  const same = newPassword.length > 0 && newPassword === currentPassword
  const mismatch = newPasswordConfirm.length > 0 && newPassword !== newPasswordConfirm
  const ready =
    currentPassword.length > 0 &&
    isValidPassword(newPassword) &&
    newPassword === newPasswordConfirm &&
    !same &&
    !submit.isPending

  return (
    <form
      aria-labelledby="password-heading"
      className="flex max-w-sm flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) submit.mutate()
      }}
    >
      <h3 id="password-heading" className="text-base font-semibold">
        비밀번호 변경
      </h3>
      <PasswordInput
        id="currentPassword"
        label="현재 비밀번호"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
      />
      <div className="flex flex-col gap-1.5">
        <PasswordInput
          id="newPassword"
          label="새 비밀번호"
          value={newPassword}
          onChange={setNewPassword}
          autoComplete="new-password"
        />
        <p className="text-muted-foreground text-sm">
          10~20자, 영문 대문자·소문자·숫자·특수문자를 각각 하나 이상
        </p>
        {same ? <p className="text-destructive text-sm">현재 비밀번호와 달라야 해요</p> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <PasswordInput
          id="newPasswordConfirm"
          label="새 비밀번호 확인"
          value={newPasswordConfirm}
          onChange={setNewPasswordConfirm}
          autoComplete="new-password"
        />
        {mismatch ? <p className="text-destructive text-sm">비밀번호가 일치하지 않아요</p> : null}
      </div>
      {submit.isError ? (
        <p role="alert" className="text-destructive text-sm">
          {problemMessage(submit.error)}
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">바꾸면 모든 기기에서 로그아웃돼요.</p>
      <div>
        <Button type="submit" className="min-h-11" disabled={!ready}>
          비밀번호 변경
        </Button>
      </div>
    </form>
  )
}

/**
 * 회원 탈퇴 (MY-04). 관리자에게는 보여 주지 않는다(명세). 서버도 403으로 막는다.
 *
 * 확인 문구를 띄어쓰기까지 정확히 입력해야 [탈퇴]가 켜진다. 이 검사는 화면만 한다(계약).
 * 탈퇴하면 브라우저에 저장한 풀이 코드도 지우고 문제 목록으로 간다 — 로그아웃과 같은
 * 정리를 하되 서버에 로그아웃을 따로 묻지 않는다(탈퇴 응답이 refresh 쿠키를 지운다).
 */
export function WithdrawSection({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const phrase = `${user.nickname}/탈퇴하겠습니다`

  const submit = useMutation({
    mutationFn: withdraw,
    onSuccess: () => {
      setAccessToken(null)
      clearSavedCode()
      void navigate('/problems', { replace: true })
      queryClient.clear()
    },
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })

  if (user.role === 'ADMIN') return null

  return (
    <section aria-labelledby="withdraw-heading" className="flex flex-col gap-3 border-t pt-6">
      <h2 id="withdraw-heading" className="text-lg font-semibold">
        회원 탈퇴
      </h2>
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setTyped('')
            submit.reset()
          }
        }}
      >
        <AlertDialogTrigger asChild>
          <Button variant="destructive" className="min-h-11 self-start">
            회원 탈퇴
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>정말 탈퇴할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              계정과 제출 기록, 학습 통계, AI 분석, 리포트가 모두 삭제되고 되돌릴 수 없어요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="withdrawConfirm" className="text-sm">
              확인을 위해 <strong className="font-semibold select-all">{phrase}</strong>를 그대로
              입력해 주세요
            </label>
            <Input
              id="withdrawConfirm"
              autoComplete="off"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </div>
          {submit.isError ? (
            <p role="alert" className="text-destructive text-sm">
              {problemMessage(submit.error)}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>그만두기</AlertDialogCancel>
            {/*
              AlertDialogAction을 쓰지 않는다. 누르는 즉시 팝업이 닫혀, 요청이 실패해도 그
              이유를 보여 줄 자리가 없어진다. 성공하면 화면을 떠나므로 닫을 일이 없다.
            */}
            <Button
              variant="destructive"
              disabled={typed !== phrase || submit.isPending}
              onClick={() => submit.mutate()}
            >
              탈퇴
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
