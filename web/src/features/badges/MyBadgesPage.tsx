import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import type { UserBadge } from '@/api/types'
import scene from '@/assets/scenes/badges.png'
import { ErrorState } from '@/components/ErrorState'
import { ListSkeleton } from '@/components/ListSkeleton'
import { Card } from '@/components/ui/card'
import { Icon } from '@/components/ui/icon'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { LearnNav } from '@/features/report/LearnNav'
import { cn } from '@/lib/utils'
import { BADGE_GROUPS, BADGE_INFO, formatUnlockedAt } from './badgeInfo'
import { badgesQuery } from './badgeQuery'

/** 남색 머리. 진행도("다음 배지까지")는 넣지 않는다(명세 BADGE-01). */
function Hero({ count }: { count: number }) {
  return (
    <Card
      as="section"
      tone="inverse"
      aria-label="배지 요약"
      className="flex flex-wrap items-center gap-6 overflow-hidden rounded-[28px] px-6 pt-8 pb-0 sm:px-10"
    >
      <div className="flex min-w-0 flex-[999_1_320px] flex-col gap-3 pb-8">
        <p className="text-eyebrow text-inverse-accent">배지</p>
        <h1 className="text-[28px] leading-[1.25] font-bold tracking-[-0.025em] break-keep sm:text-[32px]">
          배지 <span className="text-highlight tabular-nums">{count}</span>개를 모았어요
        </h1>
        <p className="text-inverse-muted text-base leading-[1.65]">
          문제를 풀고 꾸준히 제출하면 배지가 하나씩 열려요.
        </p>
      </div>
      <img
        src={scene}
        alt=""
        width={280}
        height={223}
        className="mx-auto block h-auto max-w-full self-end"
      />
    </Card>
  )
}

function BadgeCard({ badge, tone }: { badge: UserBadge; tone: string }) {
  const info = BADGE_INFO[badge.code]
  const got = badge.unlockedAt !== null
  return (
    <li className="bg-card flex flex-col items-center gap-2.5 rounded-[20px] border px-3 py-6 text-center sm:px-5">
      <span className="relative block w-full max-w-28">
        <img
          src={info.image}
          alt=""
          width={112}
          height={112}
          className={cn('block h-auto w-full', !got && 'opacity-45 grayscale')}
        />
        {got ? null : (
          <span className="bg-card text-muted-foreground absolute right-0.5 bottom-0.5 inline-flex size-[34px] items-center justify-center rounded-full shadow-[0_0_0_1px_var(--border)]">
            <Icon name="lock" />
          </span>
        )}
      </span>
      <h3 className="text-foreground text-base font-bold">{info.name}</h3>
      <p className="text-muted-foreground text-[13px] leading-normal break-keep">
        {info.condition}
      </p>
      <p className={cn('text-xs font-semibold', got ? tone : 'text-muted-foreground')}>
        {got ? `${formatUnlockedAt(badge.unlockedAt ?? '')} 획득` : '아직 못 받았어요'}
      </p>
    </li>
  )
}

/** 배지 목록 (BADGE-01). 12개를 서버 순서대로 4개씩 묶는다. */
export function Component() {
  const { data, isPending, error, refetch } = useQuery(badgesQuery())

  // 세션이 끊겼으면 로그인 화면으로 보낸다 (session.ts).
  const queryClient = useQueryClient()
  useEffect(() => {
    forgetSessionIfUnauthorized(queryClient, error)
  }, [queryClient, error])

  const byCode = new Map(data?.map((badge) => [badge.code, badge]))
  // 머리 개수도 아래 묶음과 같은 12개 코드로 센다. 서버가 먼저 배포한 모르는 배지는 묶음에 없어
  // 따로 세면 '3개를 모았어요'인데 묶음 합은 2가 된다(#294 리뷰)
  const shownBadges = BADGE_GROUPS.flatMap((group) =>
    group.codes.flatMap((code) => byCode.get(code) ?? []),
  )

  return (
    <section className="flex flex-col gap-7">
      <div>
        <LearnNav />
      </div>

      {data && !error ? (
        <Hero count={shownBadges.filter((badge) => badge.unlockedAt !== null).length} />
      ) : (
        <h1 className="page-title">배지</h1>
      )}

      {isPending && !error ? <ListSkeleton rows={4} /> : null}

      {error ? <ErrorState problem={error} onRetry={() => void refetch()} /> : null}

      {data && !error
        ? BADGE_GROUPS.map((group) => {
            const badges = group.codes.flatMap((code) => byCode.get(code) ?? [])
            const got = badges.filter((badge) => badge.unlockedAt !== null).length
            return (
              <section
                key={group.title}
                aria-labelledby={`badge-group-${group.title}`}
                className="flex flex-col gap-3.5"
              >
                <div className="flex items-baseline justify-between">
                  <h2
                    id={`badge-group-${group.title}`}
                    className="text-foreground text-xl font-bold"
                  >
                    {group.title}
                  </h2>
                  <span className="text-muted-foreground text-sm tabular-nums">
                    {got} / {badges.length}
                    <span className="sr-only">개 받음</span>
                  </span>
                </div>
                <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-4 sm:gap-4">
                  {badges.map((badge) => (
                    <BadgeCard key={badge.code} badge={badge} tone={group.tone} />
                  ))}
                </ul>
              </section>
            )
          })
        : null}
    </section>
  )
}
