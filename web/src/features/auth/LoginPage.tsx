import { useMutation, useQueryClient } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'

import hero from '@/assets/mascot/Mascot/codingmon_hero_large.png'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { AUTH_FOOT, AUTH_LINK } from './authCard'
import { loginRequest } from './authQuery'
import { startGitHubLogin } from './githubQuery'
import { loginErrorMessage, loginSchema, type LoginForm } from './loginSchema'
import { safeRedirect } from './safeRedirect'
import { adoptSession } from './session'
import { useAuth } from './useAuth'

/** 이메일 로그인 (COM-07). */
export function Component() {
  const location = useLocation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isAuthenticated, isLoading } = useAuth()

  const state = location.state as { from?: unknown; notice?: unknown; error?: unknown } | null
  const target = safeRedirect(state?.from)
  // 가입·재설정이 넘긴 한 줄. state는 사용자가 심을 수 있으니 문자열만 받는다.
  const notice = typeof state?.notice === 'string' ? state.notice : null
  // GitHub 로그인(COM-02)이 실패해 되돌려 보낸 한 줄. 안내와 같은 자리에 쓰지 않는다 —
  // 안내는 role="status"로 지나가고 실패는 role="alert"로 읽혀야 한다.
  const failure = typeof state?.error === 'string' ? state.error : null

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) })

  const login = useMutation({
    mutationFn: loginRequest,
    onSuccess: async (user) => {
      // 캐시에 세션을 들이는 네 걸음은 GitHub 로그인과 똑같아 session.ts가 들고 있다.
      await adoptSession(queryClient, user)
      // 아래의 <Navigate> 분기도 setQueryData로 isAuthenticated가 바뀌면 같은 곳으로 보내므로
      // 이 호출이 없어도 도착한다. 그래도 두는 이유는 재렌더에 기대지 않고 바로 이동하기 위해서다.
      // replace를 빼면 /login이 기록에 남는다. LoginPage.test.tsx가 PUSH 여부로 이를 지킨다.
      void navigate(target, { replace: true })
    },
  })

  // 아직 세션을 모른다. 폼을 먼저 보여 주면 이미 로그인한 사람이 입력을 시작한 뒤
  // /api/users/me가 도착하면서 아래 <Navigate>가 실행돼, 입력하던 내용이 사라진 채 이동한다.
  // RequireAuth와 같은 선택이다 (RequireAuth.tsx).
  // 이 화면은 페이지 폭 틀 없이 그린다(라우트 handle bleed). 스켈레톤에는 여백을 직접 준다.
  if (isLoading) {
    return (
      <div className="mx-auto max-w-[400px] px-6 py-12">
        <ListSkeleton rows={3} />
      </div>
    )
  }

  // 이미 로그인했으면 폼을 보여 주지 않는다. 로그인한 사람이 주소로 직접 들어오거나
  // 이 화면이 열려 있는 동안 세션이 생긴 경우다.
  if (isAuthenticated) return <Navigate to={target} replace />

  return (
    <div className="lg:min-h-[calc(100dvh-var(--spacing-topbar))] grid lg:grid-cols-2">
      {/* 소개 패널. 좁은 화면에서는 폼이 먼저라 뺀다 */}
      <section
        aria-label="소개"
        className="bg-inverse text-inverse-foreground hidden flex-col justify-between gap-6 overflow-hidden px-16 pt-[72px] lg:flex"
      >
        <div className="ml-auto flex w-full max-w-[520px] flex-col gap-3.5">
          <div>
            <Badge tone="accent">BETA</Badge>
          </div>
          {/* 페이지 제목은 오른쪽의 '로그인'이다. 이 큰 글은 소개라 제목으로 두지 않는다 */}
          <p className="m-0 text-[44px] leading-[1.2] font-bold tracking-[-0.025em]">
            틀린 이유까지,
            <br />
            코딩몬이 먼저 찾아요.
          </p>
          <p className="text-inverse-muted m-0 text-[17px] leading-[1.65]">
            채점 근거로 원인을 설명하고,{' '}
            <b className="text-inverse-foreground font-semibold">정답 대신 힌트</b>를 한 단계씩
            열어요.
          </p>
        </div>
        <img src={hero} alt="" width={320} height={384} className="block self-center" />
      </section>

      <section className="flex items-center justify-center px-6 py-12 sm:px-16">
        <div className="flex w-full max-w-[400px] flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <h1 className="page-title">로그인</h1>
            <p className="text-muted-foreground m-0 text-[15px]">다시 만나서 반가워요.</p>
          </div>

          {notice ? (
            <p role="status" className="text-sm">
              {notice}
            </p>
          ) : null}

          {/*
        방금 로그인이 실패했으면 보여 주지 않는다. 이 값은 history 항목에 남아 있어
        지우지 않으면 경고가 둘로 겹치고, 그중 하나는 이미 지나간 일을 설명한다.
      */}
          {failure && !login.isError ? (
            <p role="alert" className="text-destructive-text text-sm">
              {failure}
            </p>
          ) : null}

          {/*
        form의 onSubmit에 건다. 제출 버튼의 onClick에 걸어도 Enter는 브라우저가 기본 버튼을
        눌러 주므로 동작하지만, onSubmit은 버튼 클릭을 거치지 않는 제출까지 모두 잡고
        한 컨트롤이 아니라 폼 자신의 이벤트다.
        aria-label이 있어야 테스트와 스크린 리더가 이 폼을 이름으로 집을 수 있다.
      */}
          <form
            aria-label="로그인"
            noValidate
            className="flex flex-col gap-4"
            onSubmit={handleSubmit((values) => login.mutate(values))}
          >
            {/*
          네이티브 label을 쓴다. ProblemFilters의 체크박스와 같은 선택이다 — Radix 래퍼
          없이도 htmlFor로 입력칸과 이어지고, @/components/ui에 label이 없어 shadcn
          컴포넌트를 새로 들이지 않아도 된다.
          autoComplete은 브라우저와 비밀번호 관리자에게 각 칸이 무엇인지 알려 준다.
        */}
            <Field label="이메일" htmlFor="email" error={errors.email?.message}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register('email')}
              />
            </Field>

            <Field label="비밀번호" htmlFor="password" error={errors.password?.message}>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
            </Field>

            {/*
          role="alert"이어야 제출 후 문구가 생길 때 스크린 리더가 읽는다.
          COM-07은 실패 이유를 구분해 주지 않으므로 칸별 오류가 아니라 폼 단위 한 줄이다.
        */}
            {login.isError ? (
              <p role="alert" className="text-destructive-text text-sm">
                {loginErrorMessage(login.error)}
              </p>
            ) : null}

            {/* isPending 동안 비활성화한다. 두 번 누르면 같은 시도가 두 번 전송되어, 실패하면 서버의 시도 제한이 두 번 소모된다. */}
            <Button type="submit" size="lg" className="min-h-11" disabled={login.isPending}>
              {login.isPending ? '로그인 중…' : '로그인'}
            </Button>
          </form>

          <div
            role="separator"
            className="text-muted-foreground flex items-center gap-3 text-[13px] before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
          >
            또는
          </div>

          {/*
            GitHub 로그인 (COM-02). fetch가 아니라 브라우저 이동이라 form도 Link도 아니다 —
            이동 전에 돌아갈 주소를 적어 두어야 해서 그 일을 startGitHubLogin이 함께 한다.
            넘기는 값은 이미 safeRedirect를 통과한 target이다.
          */}
          <Button
            type="button"
            variant="secondary"
            size="lg"
            className="min-h-11"
            onClick={() => startGitHubLogin(target)}
          >
            GitHub로 로그인
          </Button>

          {/*
            원래 가려던 화면을 두 화면에 넘긴다. 둘 다 끝나면 로그인 화면으로 되돌려 보내므로,
            싣지 않으면 로그인에 성공해도 문제 상세가 아니라 목록으로 간다. 넘기는 값은 이미
            safeRedirect를 통과한 target이다.
          */}
          <p className={cn(AUTH_FOOT, 'mt-1')}>
            처음이신가요?{' '}
            <Link to="/signup" state={{ from: target }} className={AUTH_LINK}>
              회원가입
            </Link>
            {' · '}
            <Link to="/password-reset" state={{ from: target }} className={AUTH_LINK}>
              비밀번호 찾기
            </Link>
          </p>
        </div>
      </section>
    </div>
  )
}
