import { useMutationState, useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import type { BadgeCode } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { useAuth } from '@/features/auth/useAuth'
import { isDeadEnd, isFinished, submissionResultQuery } from '@/features/result/resultQuery'
import { SUBMIT_MUTATION_KEY } from '@/features/solve/submitQuery'
import { BADGE_INFO } from './badgeInfo'
import { badgesQuery, fetchMyBadges, markCelebrated } from './badgeQuery'

/** 축하 창 (BADGE-03). 모든 화면 위에 하나 둔다(RootLayout). 비로그인은 낸 제출이 없다. */
export function BadgeCelebrator() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Celebrator /> : null
}

/**
 * 내 제출의 채점이 끝나면 배지 목록을 받아, 받았는데 축하 전인 배지를 하나씩 띄운다(계약 `getMyBadges`).
 *
 * 지켜볼 제출은 이번 세션에 낸 것이다 — 제출 mutation의 기록에서 번호를 옮겨 와 직접 든다.
 * mutation은 결과 화면으로 넘어가면 관찰자가 없어 5분(gcTime) 뒤 지워지므로, 채점이 그보다
 * 오래 걸려도 놓치지 않게 옮겨 둔다(#248 리뷰). 끝나서 확인한 제출은 내려놓아 구독을 끊는다.
 * 구독하는 동안은 결과 화면을 떠나도 폴링이 이어진다(같은 키라 요청이 겹치지 않는다).
 * 기록에서 연 끝난 제출은 mutation이 없어 띄우지 않는다.
 *
 * shortcut: 채점 중에 새로고침하면 그 제출을 놓친다. 배지는 남아 다음 제출의 채점이 끝날 때 함께 뜬다(명세가 허용).
 */
function Celebrator() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const ids = useMutationState({
    filters: { mutationKey: SUBMIT_MUTATION_KEY, status: 'success' },
    select: (mutation) => mutation.state.data as number,
  })
  // 한 번 옮겨 온 번호는 다시 옮기지 않는다. 렌더 중 상태 갱신으로 새 번호를 잡는다(아래 shown과 같은 방식)
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set())
  const [watching, setWatching] = useState<number[]>([])
  const fresh = ids.filter((id) => !seen.has(id))
  if (fresh.length > 0) {
    setSeen(new Set([...seen, ...fresh]))
    setWatching([...watching, ...fresh])
  }

  // 끝났거나, 폴링이 포기한 제출(isDeadEnd: 첫 조회 실패·401·403·404). 포기한 제출은 다시 묻지 않으니
  // 남겨 두면 구독만 세션 내내 남는다. 함께 내려놓고 배지를 한 번 본다 — 못 본 배지는 다음 채점에 뜬다(#294 리뷰)
  const finished = useQueries({
    queries: watching.map((id) => submissionResultQuery(id)),
    combine: (results) =>
      watching.filter((_, i) => {
        const result = results[i]
        const status = result?.data?.status
        if (status !== undefined && isFinished(status)) return true
        return result !== undefined && isDeadEnd(result.error, result.data !== undefined)
      }),
  })

  // 확인 중인 제출, 한 번 띄운 배지. 축하 기록(POST)이 끝나기 전에 다음 채점이 끝나면
  // 서버는 아직 celebrated=false를 줘서 방금 닫은 배지가 다시 뜬다
  const checking = useRef(new Set<number>())
  const queued = useRef(new Set<BadgeCode>())
  const [queue, setQueue] = useState<BadgeCode[]>([])

  // 로그아웃하면 이 인스턴스는 사라진다. 그 뒤 도착한 앞사람의 응답이 다음 사람의 세션을 건드리지 않게 한다
  const alive = useRef(true)
  useEffect(
    () => () => {
      alive.current = false
    },
    [],
  )

  // 축하 창이 낸 조회의 순번. 둘이 거꾸로 도착하면 늦게 낸 쪽만 캐시에 넣는다
  const latest = useRef(0)

  const finishedKey = finished.join(',')
  useEffect(() => {
    const done = finished.filter((id) => !checking.current.has(id))
    if (done.length === 0) return
    done.forEach((id) => checking.current.add(id))
    const order = ++latest.current
    // fetchQuery는 진행 중인 같은 키의 요청(앞 제출의 확인, 열려 있는 배지 화면)을 그대로 돌려줘서
    // 방금 끝난 제출로 받은 배지가 빠진 응답을 볼 수 있다. 그래서 따로 묻는다(#294 리뷰).
    // 받은 목록은 배지 화면의 진행 중인 요청을 취소한 뒤 넣는다. 그대로 두면 늦게 도착한 옛 응답이
    // 덮어써 방금 축하한 배지가 잠긴 채로 남는다. 무효화로는 안 된다 — 데이터가 아직 없는 첫 조회는
    // 취소되지 않고 그 요청을 그대로 기다린다(2차 리뷰, useRequestAnalysis와 같은 순서)
    fetchMyBadges()
      .then(
        async (badges) => {
          if (!alive.current) return
          if (order === latest.current) {
            const { queryKey } = badgesQuery()
            await queryClient.cancelQueries({ queryKey })
            queryClient.setQueryData(queryKey, badges)
          }
          const waiting = badges
            .filter(
              (b) =>
                b.unlockedAt !== null &&
                !b.celebrated &&
                !queued.current.has(b.code) &&
                // 웹이 아직 모르는 코드(서버가 먼저 배포됨)는 그릴 이름·그림이 없다.
                // `in`은 constructor 같은 프로토타입 키도 통과시킨다(constants/errors.ts와 같은 검사)
                Object.hasOwn(BADGE_INFO, b.code),
            )
            .map((b) => b.code)
          waiting.forEach((code) => queued.current.add(code))
          if (waiting.length > 0) setQueue((q) => [...q, ...waiting])
        },
        // 못 받았으면 띄우지 않는다. 배지는 서버에 남아 다음 채점이 끝날 때 다시 본다.
        // 세션이 끊겼으면(채점 조회의 401도 여기로 이어진다) 다른 화면처럼 로그인 화면으로 보낸다
        (error: unknown) => {
          if (alive.current) forgetSessionIfUnauthorized(queryClient, error)
        },
      )
      .finally(() => {
        done.forEach((id) => checking.current.delete(id))
        setWatching((w) => w.filter((id) => !done.includes(id)))
      })
    // finished는 렌더마다 새 배열이라 번호 목록으로 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedKey, queryClient])

  const current = queue[0]
  useEffect(() => {
    // 실패하면 다음 채점이 끝날 때 다시 뜬다(이 세션에서는 queued가 막는다)
    if (current) markCelebrated(current).catch(() => {})
  }, [current])

  // 닫히는 동안에도 마지막 배지를 그린다. 렌더 중 상태 갱신으로 바뀐 때를 잡는다(Modal과 같은 방식)
  const [shown, setShown] = useState(current)
  if (current && current !== shown) setShown(current)
  const info = shown ? BADGE_INFO[shown] : undefined

  const close = () => setQueue((q) => q.slice(1))

  return (
    <Modal
      open={current !== undefined}
      onClose={close}
      align="center"
      media={
        info ? (
          <span className="flex flex-col items-center gap-3">
            <img src={info.image} alt="" width={160} height={160} className="block" />
            <Badge tone="warning">새 배지</Badge>
          </span>
        ) : null
      }
      title={info ? `'${info.name}' 배지를 받았어요` : ''}
      description={info?.achieved}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              close()
              void navigate('/me/badges')
            }}
          >
            배지 보기
          </Button>
          <Button type="button" onClick={close}>
            확인
          </Button>
        </>
      }
    />
  )
}
