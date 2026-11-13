import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link } from 'react-router'

import type { CurrentUser, UserActivity } from '@/api/types'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { StatCard } from '@/components/ui/stat-card'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { useAuth } from '@/features/auth/useAuth'
import { DIFFICULTY_LABEL } from '@/features/problems/labels'
import { cn } from '@/lib/utils'
import { activeMonths, buildWeeks, grassLevel, monthLabels } from './grass'
import { MY_CARD as CARD, MyLayout } from './MyLayout'
import { activityQuery } from './myPageQuery'

const LOGIN_METHOD_LABEL: Record<CurrentUser['loginMethod'], string> = {
  EMAIL: '이메일',
  GITHUB: 'GitHub',
}

/** 계정 정보 (MY-01). `/api/users/me`는 헤더가 이미 받아 둔 값이라 따로 부르지 않는다. */
function AccountInfo({ user }: { user: CurrentUser }) {
  return (
    <section aria-label="계정 정보" className={cn(CARD, 'flex-row flex-wrap items-center gap-5')}>
      <Avatar src={user.avatarUrl ?? undefined} name={user.nickname} size={64} />
      <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <p className="text-foreground text-[22px] font-bold tracking-[-0.02em]">
            {user.nickname}
          </p>
          {/*
            세 값은 계약상 늘 오지만(값이 없으면 null) 예전 서버는 보내지 않았다(#185). 빠진
            값(undefined)도 '없음'으로 보고 뺀다 — 서버가 필드를 빼먹는 회귀가 와도 빈 칸 대신 빠질 뿐이다.
          */}
          {user.loginMethod ? (
            <Badge tone="outline">{`${LOGIN_METHOD_LABEL[user.loginMethod]} 로그인`}</Badge>
          ) : null}
        </div>
        {/* 가린 이메일이다(계약). GitHub 가입자는 null이라 대신 GitHub 아이디를 둔다 */}
        {user.email != null ? (
          <p className="text-muted-foreground text-[15px]">{user.email}</p>
        ) : null}
        {user.githubUsername != null ? (
          <p className="text-muted-foreground text-[15px]">
            GitHub <span className="text-body-foreground">{user.githubUsername}</span>
          </p>
        ) : null}
      </div>
      <Button asChild variant="secondary" size="sm">
        <Link to="/me/account">프로필 수정</Link>
      </Button>
    </section>
  )
}

/** 맞힌·틀린 수와 활동한 날 (MY-05). 가장 자랑할 숫자(활동한 날)만 남색이다(StatCard 규칙). */
function Stats({ activity }: { activity: UserActivity }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <StatCard label="맞힌 문제" value={activity.solvedCount} unit="개" icon="check" />
      <StatCard label="틀린 문제" value={activity.wrongCount} unit="개" icon="x" />
      <StatCard
        label="활동한 날"
        value={activity.totalActiveDays}
        unit="일"
        icon="calendar"
        tone="inverse"
      />
    </div>
  )
}

/** 난이도별 맞힌 수 (MY-05). 막대의 기준은 맞힌 문제 전체다. */
function ByDifficulty({ activity }: { activity: UserActivity }) {
  return (
    <section aria-labelledby="difficulty-heading" className={cn(CARD, 'gap-5')}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="difficulty-heading" className="text-foreground text-lg font-semibold">
          난이도별 맞힌 문제
        </h2>
        {/* 명세 MY-05: 내 학습·제출 기록으로 가는 링크. 디자인에는 리포트 링크만 있지만 명세를 따른다(#274 리뷰) */}
        <div className="flex flex-wrap gap-4">
          <Link
            to="/submissions"
            className="text-primary-text text-sm font-semibold hover:underline"
          >
            제출 기록 보기 →
          </Link>
          <Link to="/me/report" className="text-primary-text text-sm font-semibold hover:underline">
            학습 리포트 보기 →
          </Link>
        </div>
      </div>
      <div className="grid gap-6 sm:grid-cols-3 sm:gap-8">
        {(['EASY', 'MEDIUM', 'HARD'] as const).map((level) => (
          <Progress
            key={level}
            label={DIFFICULTY_LABEL[level]}
            value={activity.solvedByDifficulty[level]}
            max={activity.solvedCount}
            showValue
          />
        ))}
      </div>
    </section>
  )
}

// 0단계(제출 없는 날)는 bg-muted가 아니라 bg-border다. muted(#f4f6fb)는 흰 카드 위 1.08:1이라 칸이 사라진다.
// border는 1.24:1(다크 1.32:1)로 옛 muted(1.23:1) 수준이다. 격자 모양이 보여야 '쉰 날'도 읽힌다
const LEVEL_CLASS = ['bg-border', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary']

/**
 * 최근 1년 잔디 (MY-05). 365칸을 하나하나 읽게 하면 화면 낭독기 사용자가 지나갈 수 없어
 * 그림 하나로 묶고 요약을 이름으로 준다. 칸마다 날짜·제출 수는 마우스를 올리면 보인다.
 */
function Grass({ activity }: { activity: UserActivity }) {
  const weeks = buildWeeks(activity)
  const labels = monthLabels(weeks)
  return (
    <figure className="m-0 flex flex-col gap-2.5">
      {/*
        디자인처럼 카드 폭을 채운다: 주 열을 1fr로 나누고 칸은 정사각형이다. 좁으면 칸이 너무 작아지지 않게
        최소 폭에서 멈추고 가로로 스크롤한다. rtl은 스크롤이 오른쪽 끝(최근)에서 시작하게 하려는 것이고,
        안쪽은 ltr로 되돌려 날짜 순서는 그대로다.
      */}
      <div dir="rtl" className="overflow-x-auto pb-1">
        <div
          dir="ltr"
          role="img"
          aria-label={`최근 1년 동안 ${activity.totalActiveDays}일 제출했어요`}
          className="grid w-full min-w-[560px] grid-flow-col gap-[3px]"
          style={{ gridTemplateRows: 'auto repeat(7, auto)', gridAutoColumns: 'minmax(0, 1fr)' }}
        >
          {weeks.map((week, w) => (
            <div key={w} className="contents">
              {/* 폭을 0으로 둬서 글자는 옆 칸 위로 넘친다. 글자 폭만큼 그 주가 넓어지지 않게 한다. */}
              <span
                aria-hidden="true"
                className="text-muted-foreground mb-1 h-4 w-0 overflow-visible text-xs leading-4 whitespace-nowrap"
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
                    className={cn(
                      'aspect-square w-full rounded-[3px]',
                      LEVEL_CLASS[grassLevel(cell.count)],
                    )}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="text-muted-foreground flex items-center justify-end gap-1 text-xs font-medium">
        <span className="mr-1">적음</span>
        {LEVEL_CLASS.map((cls) => (
          <span key={cls} aria-hidden="true" className={cn('size-3.5 rounded-[4px]', cls)} />
        ))}
        <span className="ml-1">많음</span>
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

  if (error) return <ErrorState problem={error} onRetry={() => void refetch()} />
  if (isPending) return <ListSkeleton rows={3} />

  return (
    <>
      <Stats activity={data} />
      <section aria-labelledby="activity-heading" className={cn(CARD, 'gap-4')}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="activity-heading" className="text-foreground text-lg font-semibold">
            활동 기록
          </h2>
          <span className="text-muted-foreground text-sm">
            최근 12개월 중{' '}
            <strong className="text-foreground font-bold">{activeMonths(data)}개월</strong> 활동 ·
            총 {data.totalActiveDays}일
          </span>
        </div>
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
      </section>
      <ByDifficulty activity={data} />
    </>
  )
}

/** 마이페이지 · 프로필 · 학습 요약 (MY-01·05). 계정 설정·탈퇴는 메뉴의 각 화면이다(#243). */
export function Component() {
  const { user } = useAuth()
  return (
    <MyLayout title="프로필 · 학습 요약">
      {user ? <AccountInfo user={user} /> : null}
      <Activity />
    </MyLayout>
  )
}
