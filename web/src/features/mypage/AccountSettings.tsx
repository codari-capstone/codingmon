import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { endSession } from '@/api/session'
import type { CurrentUser } from '@/api/types'
import { Alert } from '@/components/ui/alert'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { MY_CARD } from './MyLayout'
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
  const [saved, setSaved] = useState(false)

  const save = useMutation({
    mutationFn: () => updateNickname(check.value),
    onSuccess: async (updated) => {
      // 상단 닉네임도 바로 바뀐다(명세). /api/users/me를 다시 묻지 않는다 — 응답이 그 값이다.
      // 떠 있던 /me 조회는 먼저 취소한다. 저장 전에 만든 옛 응답이 늦게 와 이 값을 덮으면
      // 상단 닉네임과 탈퇴 확인 문구가 이전 닉네임으로 돌아간다(adoptSession과 같은 순서).
      await queryClient.cancelQueries({ queryKey: ME_QUERY_KEY })
      queryClient.setQueryData(ME_QUERY_KEY, updated)
      check.change('')
      setSaved(true)
    },
    onError: (error) => {
      forgetSessionIfUnauthorized(queryClient, error)
      if (problemCode(error) === 'NICKNAME_TAKEN') check.release()
    },
  })

  // save 뒤에 선언한다(가입 화면과 같은 순서) — 확인이 끝나면 지난 저장 실패 문구를 지운다.
  // 남겨 두면 '쓸 수 있어요'와 '이미 사용 중'이 함께 보인다. 저장 요청이 오가는 중이면
  // 지우지 않는다 — reset()은 '진행 중'까지 지워 [저장]이 다시 켜지고 두 번째 PATCH가 나간다.
  const check = useNicknameCheck(inputRef, () => {
    if (!save.isPending) save.reset()
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
      className={cn(MY_CARD, 'gap-5')}
      onSubmit={(event) => {
        event.preventDefault()
        if (canSave) save.mutate()
      }}
    >
      <CardHeading
        id="nickname-heading"
        title="프로필"
        description="다른 사람에게 보이는 이름이에요."
      />
      {/* 사진은 GitHub 이미지이고 없으면 첫 글자다(MY-01). 바꾸는 API가 없어 디자인의 사진 버튼은 두지 않는다 */}
      <Avatar src={user.avatarUrl ?? undefined} name={user.nickname} size={56} />
      <NicknameField
        check={{
          ...check,
          change: (next) => {
            setSaved(false)
            if (!save.isPending) save.reset()
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
      {/* 가린 이메일이다(계약). GitHub 가입자는 이메일이 없어 칸을 두지 않는다 */}
      {user.email != null ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-semibold">
            이메일
          </label>
          <Input id="email" value={user.email} disabled readOnly />
          <p className="text-muted-foreground text-sm">이메일은 바꿀 수 없어요.</p>
        </div>
      ) : null}
      {save.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
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
 * 바꾸면 모든 기기에서 로그아웃된다(계약). 이 브라우저의 세션도 `endSession()`으로 끝낸다 —
 * 세대를 올려 늦게 오는 토큰 갱신 응답이 세션을 되살리지 못하게 하고, 같은 브라우저의 다른
 * 탭에도 알린다(로그아웃과 같은 길, authQuery.ts). 그리고 로그인 화면으로 보내
 * 재설정(COM-08)과 같은 안내를 띄운다. 저장한 풀이 코드는 지우지 않는다 — 같은
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
      endSession()
      void navigate('/login', { replace: true, state: { notice: PASSWORD_CHANGED_NOTICE } })
      queryClient.clear()
    },
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })

  if (user.loginMethod === 'GITHUB') {
    return (
      <section aria-labelledby="password-heading" className={cn(MY_CARD, 'gap-5')}>
        <CardHeading
          id="password-heading"
          title="비밀번호 변경"
          description="GitHub로 로그인한 계정은 비밀번호가 없어요"
        />
        <div>
          <Button className="min-h-11" disabled>
            비밀번호 변경
          </Button>
        </div>
      </section>
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
      className={cn(MY_CARD, 'gap-5')}
      onSubmit={(event) => {
        event.preventDefault()
        if (ready) submit.mutate()
      }}
    >
      {/* 디자인의 '마지막으로 바꾼 날'은 계약에 없는 값이라 두지 않는다 */}
      <CardHeading id="password-heading" title="비밀번호 변경" />
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
        {same ? (
          <p className="text-destructive-text text-sm">
            지금 쓰는 비밀번호와 같아요. 다른 비밀번호를 입력해 주세요
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <PasswordInput
          id="newPasswordConfirm"
          label="새 비밀번호 확인"
          value={newPasswordConfirm}
          onChange={setNewPasswordConfirm}
          autoComplete="new-password"
        />
        {mismatch ? (
          <p className="text-destructive-text text-sm">
            비밀번호 확인이 일치하지 않아요. 같은 비밀번호를 입력해 주세요
          </p>
        ) : null}
      </div>
      {submit.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {problemMessage(submit.error)}
        </p>
      ) : null}
      <Alert tone="warning">바꾸면 모든 기기에서 로그아웃돼요.</Alert>
      <div>
        <Button type="submit" className="min-h-11" disabled={!ready}>
          비밀번호 변경
        </Button>
      </div>
    </form>
  )
}

/** 카드 머리: 제목(h2) + 한 줄 설명 (디자인 `mp-h2`·`mp-desc`) */
function CardHeading({
  id,
  title,
  description,
}: {
  id: string
  title: string
  description?: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <h2 id={id} className="text-foreground text-lg font-semibold">
        {title}
      </h2>
      {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
    </div>
  )
}

/** 로그인 방법 (MY-01: 로그인 방식·연결된 GitHub 아이디). 연결을 끊거나 더하는 기능은 없다 */
export function LoginMethodCard({ user }: { user: CurrentUser }) {
  // 예전 서버는 loginMethod를 보내지 않았다(#185). 모르면 카드를 그리지 않는다
  if (!user.loginMethod) return null
  const github = user.loginMethod === 'GITHUB'
  return (
    <section aria-labelledby="login-method-heading" className={cn(MY_CARD, 'gap-5')}>
      <CardHeading
        id="login-method-heading"
        title="로그인 방법"
        description="연결된 로그인 방법이에요."
      />
      <div className="bg-muted flex items-center gap-3.5 rounded-[14px] px-4.5 py-4">
        <span className="bg-accent text-primary-text inline-flex size-10 shrink-0 items-center justify-center rounded-[12px]">
          <Icon name={github ? 'code' : 'lock'} size={20} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-foreground text-[15px] font-semibold">
            {github ? 'GitHub' : '이메일과 비밀번호'}
          </span>
          {(github ? user.githubUsername : user.email) ? (
            <span className="text-muted-foreground truncate text-[13px]">
              {github ? user.githubUsername : user.email}
            </span>
          ) : null}
        </div>
        <Badge tone="success">연결됨</Badge>
      </div>
    </section>
  )
}

/**
 * 회원 탈퇴 확인 (MY-04). 관리자에게는 보여 주지 않는다(명세). 서버도 403으로 막는다.
 *
 * 디자인은 팝업이 아니라 화면 안의 '탈퇴 확인' 카드다. 확인 방법은 디자인의 비밀번호·동의 대신 명세대로
 * 확인 문구다 — 탈퇴 API는 비밀번호를 받지 않고, GitHub 가입자는 비밀번호가 없다.
 * 확인 문구를 띄어쓰기까지 정확히 입력해야 [회원 탈퇴]가 켜진다. 이 검사는 화면만 한다(계약).
 * 탈퇴하면 브라우저에 저장한 풀이 코드도 지우고 문제 목록으로 간다 — 로그아웃과 같은
 * 정리를 하되 서버에 로그아웃을 따로 묻지 않는다(탈퇴 응답이 refresh 쿠키를 지운다).
 * 세션은 로그아웃처럼 `endSession()`으로 끝내 다른 탭에도 알린다. 공용 PC에서 남은 탭이
 * 탈퇴한 사람의 정보를 계속 보여 주지 않게 한다.
 */
export function WithdrawSection({ user }: { user: CurrentUser }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [typed, setTyped] = useState('')
  const phrase = `${user.nickname}/탈퇴하겠습니다`

  const submit = useMutation({
    mutationFn: withdraw,
    onSuccess: () => {
      endSession()
      clearSavedCode()
      void navigate('/problems', { replace: true })
      queryClient.clear()
    },
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })

  if (user.role === 'ADMIN') return null

  return (
    <form
      aria-labelledby="withdraw-heading"
      className={cn(MY_CARD, 'gap-5')}
      onSubmit={(event) => {
        event.preventDefault()
        if (typed === phrase && !submit.isPending) submit.mutate()
      }}
    >
      <CardHeading id="withdraw-heading" title="탈퇴 확인" />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="withdrawConfirm" className="text-sm font-semibold">
          확인을 위해 <strong className="select-all">{phrase}</strong>를 그대로 입력해 주세요
        </label>
        <Input
          id="withdrawConfirm"
          autoComplete="off"
          value={typed}
          onChange={(event) => {
            setTyped(event.target.value)
            if (!submit.isPending) submit.reset()
          }}
        />
        <p className="text-muted-foreground text-sm">띄어쓰기까지 똑같이 입력해야 해요.</p>
      </div>
      {submit.isError ? (
        <p role="alert" className="text-destructive-text text-sm">
          {problemMessage(submit.error)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        <Button
          type="submit"
          variant="danger"
          className="min-h-11"
          disabled={typed !== phrase || submit.isPending}
        >
          회원 탈퇴
        </Button>
        <Button asChild variant="secondary" className="min-h-11">
          <Link to="/me">계속 이용할게요</Link>
        </Button>
      </div>
    </form>
  )
}
