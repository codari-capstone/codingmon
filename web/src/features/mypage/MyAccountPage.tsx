import { useAuth } from '@/features/auth/useAuth'
import { LoginMethodCard, NicknameForm, PasswordForm } from './AccountSettings'
import { MyLayout } from './MyLayout'

/** 계정 설정 (MY-01~03): 프로필(닉네임) · 비밀번호 변경 · 로그인 방법. */
export function Component() {
  const { user } = useAuth()
  return (
    <MyLayout title="계정 설정" description="닉네임, 비밀번호, 로그인 방법을 관리해요." narrow>
      {user ? (
        <>
          <NicknameForm user={user} />
          <PasswordForm user={user} />
          <LoginMethodCard user={user} />
        </>
      ) : null}
    </MyLayout>
  )
}
