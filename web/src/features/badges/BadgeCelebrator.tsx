import { useMutationState, useQueries, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import type { BadgeCode } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { useAuth } from '@/features/auth/useAuth'
import { isFinished, submissionResultQuery } from '@/features/result/resultQuery'
import { SUBMIT_MUTATION_KEY } from '@/features/solve/submitQuery'
import { BADGE_INFO } from './badgeInfo'
import { badgesQuery, markCelebrated } from './badgeQuery'

/** 축하 창 (BADGE-03). 모든 화면 위에 하나 둔다(RootLayout). 비로그인은 낸 제출이 없다. */
export function BadgeCelebrator() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <Celebrator /> : null
}

/**
 * 내 제출의 채점이 끝나면 배지 목록을 받아, 받았는데 축하 전인 배지를 하나씩 띄운다(계약 `getMyBadges`).
 *
 * 지켜볼 제출은 이번 세션에 낸 것이다 — 제출 mutation의 기록을 읽어 새 저장소를 두지 않는다.
 * 그 번호들을 여기서도 구독하니 결과 화면을 떠나도 폴링이 이어진다(같은 키라 요청이 겹치지 않는다).
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
  const finished = useQueries({
    queries: ids.map((id) => submissionResultQuery(id)),
    combine: (results) =>
      ids.filter((_, i) => {
        const status = results[i]?.data?.status
        return status !== undefined && isFinished(status)
      }),
  })

  // 한 번 확인한 제출, 한 번 띄운 배지. 축하 기록(POST)이 끝나기 전에 다음 채점이 끝나면
  // 서버는 아직 celebrated=false를 줘서 방금 닫은 배지가 다시 뜬다
  const checked = useRef(new Set<number>())
  const queued = useRef(new Set<BadgeCode>())
  const [queue, setQueue] = useState<BadgeCode[]>([])

  const finishedKey = finished.join(',')
  useEffect(() => {
    const fresh = finished.filter((id) => !checked.current.has(id))
    if (fresh.length === 0) return
    fresh.forEach((id) => checked.current.add(id))
    queryClient.fetchQuery(badgesQuery()).then(
      (badges) => {
        const waiting = badges
          .filter((b) => b.unlockedAt !== null && !b.celebrated && !queued.current.has(b.code))
          .map((b) => b.code)
        waiting.forEach((code) => queued.current.add(code))
        if (waiting.length > 0) setQueue((q) => [...q, ...waiting])
      },
      // 못 받았으면 띄우지 않는다. 배지는 서버에 남아 다음 채점이 끝날 때 다시 본다
      () => {},
    )
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
