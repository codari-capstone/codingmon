import { QueryClient } from '@tanstack/react-query'

const DEFAULT_POLL_INTERVAL_MS = 1000

/**
 * 채점 진행률 폴링 간격.
 *
 * Number()만 쓰면 빈 문자열은 0, 숫자가 아닌 값은 NaN이 된다. 그 값을
 * refetchInterval에 넘기면 폴링이 돌지 않아 채점 진행률이 갱신되지 않는다.
 * 양수가 아니면 기본값으로 되돌린다.
 */
export function readPollInterval(raw: string | undefined): number {
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POLL_INTERVAL_MS
}

export const POLL_INTERVAL_MS = readPollInterval(import.meta.env.VITE_POLL_INTERVAL_MS)

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 판정·지문처럼 한 번 확정되면 바뀌지 않는 데이터가 많아 기본 staleTime을 둔다.
        staleTime: 30_000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  })
}
