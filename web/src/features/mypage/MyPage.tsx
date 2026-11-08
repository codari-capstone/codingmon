import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router'

import type { CurrentUser, UserActivity } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { useAuth } from '@/features/auth/useAuth'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { cn } from '@/lib/utils'
import { NicknameForm, PasswordForm, WithdrawSection } from './AccountSettings'
import { buildWeeks, grassLevel, monthLabels } from './grass'
import { activityQuery } from './myPageQuery'

const LOGIN_METHOD_LABEL: Record<CurrentUser['loginMethod'], string> = {
  EMAIL: '이메일',
  GITHUB: 'GitHub',
}

/** 계정 정보 (MY-01). `/api/users/me`는 헤더가 이미 받아 둔 값이라 따로 부르지 않는다. */
function AccountInfo({ user }: { user: CurrentUser }) {
  return (
    <section
      aria-labelledby="account-heading"
      className="bg-card flex flex-col gap-4 rounded-2xl p-6"
    >
      <h2 id="account-heading" className="text-lg font-semibold">
        계정 정보
      </h2>
      <div className="flex items-start gap-4">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" className="size-16 shrink-0 rounded-full" />
        ) : (
          // GitHub 이미지가 없으면 기본 이미지 대신 첫 글자를 쓴다(상단 사용자 메뉴와 같은 모양).
          <span
            aria-hidden="true"
            className="bg-primary/15 text-primary-text flex size-16 shrink-0 items-center justify-center rounded-full text-2xl font-bold"
          >
            {user.nickname.slice(0, 1)}
          </span>
        )}
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">닉네임</dt>
          <dd className="font-medium">{user.nickname}</dd>
          {/*
            세 값은 계약상 늘 오지만(값이 없으면 null) 지금 서버는 아직 보내지 않는다(#185에서
            추가). 그래서 null뿐 아니라 빠진 값(undefined)도 '없음'으로 보고 줄을 뺀다 —
            `!== null`만 보면 빠진 값이 통과해 빈 줄이 그려진다. #185 뒤에도 남겨 둔다 — 서버가
            필드를 빼먹는 회귀가 와도 빈 줄 대신 줄이 빠질 뿐이다.
          */}
          {user.loginMethod ? (
            <>
              <dt className="text-muted-foreground">로그인 방식</dt>
              <dd>{LOGIN_METHOD_LABEL[user.loginMethod]}</dd>
            </>
          ) : null}
          {/* 가린 이메일이다(계약). GitHub 가입자는 null이라 줄을 뺀다. */}
          {user.email != null ? (
            <>
              <dt className="text-muted-foreground">이메일</dt>
              <dd>{user.email}</dd>
            </>
          ) : null}
          {user.githubUsername != null ? (
            <>
              <dt className="text-muted-foreground">GitHub 아이디</dt>
              <dd>{user.githubUsername}</dd>
            </>
          ) : null}
        </dl>
      </div>
    </section>
  )
}

/** 맞힌·틀린 수와 난이도별 맞힌 수 (MY-05). */
function Summary({ activity }: { activity: UserActivity }) {
  const { solvedCount, wrongCount, solvedByDifficulty } = activity
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(2,minmax(0,10rem))]">
        <div className="bg-muted/60 rounded-xl p-4">
          <dt className="text-muted-foreground text-sm">맞힌 문제</dt>
          <dd className="text-3xl font-bold tracking-tight tabular-nums">{solvedCount}</dd>
        </div>
        <div className="bg-muted/60 rounded-xl p-4">
          <dt className="text-muted-foreground text-sm">틀린 문제</dt>
          <dd className="text-3xl font-bold tracking-tight tabular-nums">{wrongCount}</dd>
        </div>
      </dl>
      <p className="text-muted-foreground text-sm">
        난이도별 맞힌 문제:{' '}
        {(['EASY', 'MEDIUM', 'HARD'] as const).map((level, i) => (
          <span key={level}>
            {i > 0 ? ', ' : null}
            {DIFFICULTY_LABEL[level]}{' '}
            <span className="text-foreground font-medium tabular-nums">
              {solvedByDifficulty[level]}
            </span>
          </span>
        ))}
      </p>
    </div>
  )
}

const LEVEL_CLASS = ['bg-muted', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary']

/**
 * 최근 1년 잔디 (MY-05). 365칸을 하나하나 읽게 하면 화면 낭독기 사용자가 지나갈 수 없어
 * 그림 하나로 묶고 요약을 이름으로 준다. 칸마다 날짜·제출 수는 마우스를 올리면 보인다.
 */
function Grass({ activity }: { activity: UserActivity }) {
  const weeks = buildWeeks(activity)
  const labels = monthLabels(weeks)
  return (
    <figure className="m-0 flex flex-col gap-2">
      <div className="overflow-x-auto pb-1">
        <div
          role="img"
          aria-label={`최근 1년 동안 ${activity.totalActiveDays}일 제출했어요`}
          className="inline-grid grid-flow-col gap-[3px]"
          style={{ gridTemplateRows: 'auto repeat(7, 11px)' }}
        >
          {weeks.map((week, w) => (
            <div key={w} className="contents">
              {/* 폭을 칸과 같게 둬서 글자는 옆 칸 위로 넘친다. 글자 폭만큼 그 주가 넓어지지 않게 한다. */}
              <span
                aria-hidden="true"
                className="text-muted-foreground h-4 w-[11px] overflow-visible text-[11px] leading-4 whitespace-nowrap"
              >
                {labels[w]}
              </span>
              {Array.from({ length: 7 }, (_, d) => {
                const cell = week[d]
                if (!cell || cell.date === null) return <span key={d} aria-hidden="true" />
                return (
                  <span
                    key={d}
                    aria-hidden="true"
                    title={`${cell.date} 제출 ${cell.count}회`}
                    className={cn('size-[11px] rounded-[2px]', LEVEL_CLASS[grassLevel(cell.count)])}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="text-muted-foreground flex items-center gap-1 text-xs">
        적음
        {LEVEL_CLASS.map((cls) => (
          <span key={cls} aria-hidden="true" className={cn('size-[11px] rounded-[2px]', cls)} />
        ))}
        많음
      </figcaption>
    </figure>
  )
}

/** 풀이 요약·활동 기록 (MY-05). */
function Activity() {
  const { data, isPending, error, refetch } = useQuery(activityQuery())

  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  return (
    <section
      aria-labelledby="activity-heading"
      className="bg-card flex flex-col gap-4 rounded-2xl p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="activity-heading" className="text-lg font-semibold">
          풀이 요약
        </h2>
        <div className="flex gap-4 text-sm">
          <Link to="/me/report" className="text-primary-text underline">
            내 학습
          </Link>
          <Link to="/submissions" className="text-primary-text underline">
            제출 기록
          </Link>
        </div>
      </div>

      {isPending && !error ? <ListSkeleton rows={3} /> : null}
      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error ? (
        <>
          <Summary activity={data} />
          <h3 className="mt-2 text-base font-semibold">
            활동 기록{' '}
            <span className="text-muted-foreground text-sm font-normal">
              총 {data.totalActiveDays}일
            </span>
          </h3>
          {/*
            제출이 없어도 숫자는 0, 잔디는 빈 칸으로 그린다(명세 MY-05). 잔디는 최근 1년,
            맞힌·틀린 수는 전체 기간이라 둘을 함께 본다 — 1년 전에만 푼 사람에게 '맞힌 문제 7'과
            '아직 제출한 문제가 없어요'가 같이 나오면 안 된다.
          */}
          {data.days.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {data.solvedCount === 0 && data.wrongCount === 0
                ? '아직 제출한 문제가 없어요.'
                : '최근 1년 동안 제출한 날이 없어요.'}
            </p>
          ) : null}
          <Grass activity={data} />
        </>
      ) : null}
    </section>
  )
}

/** 마이페이지 (MY-01~05). 모든 내용을 한 화면에 둔다(명세). 탈퇴는 맨 아래다. */
export function Component() {
  const { user } = useAuth()

  return (
    <section className="flex flex-col gap-8">
      <h1 className="page-title">마이페이지</h1>
      {/* RequireAuth 뒤라 user가 있다. 세션이 막 끊긴 순간만 비어 있을 수 있다. */}
      {user ? (
        <>
          <AccountInfo user={user} />
          <section
            aria-labelledby="settings-heading"
            className="bg-card flex flex-col gap-6 rounded-2xl p-6"
          >
            <h2 id="settings-heading" className="text-lg font-semibold">
              계정 설정
            </h2>
            <NicknameForm user={user} />
            <PasswordForm user={user} />
          </section>
        </>
      ) : null}
      <Activity />
      {user ? <WithdrawSection user={user} /> : null}
    </section>
  )
}
