import { QueryClient } from '@tanstack/react-query'

/** 채점 진행률 폴링 간격. 서버가 아직 없을 때도 기본값으로 동작한다. */
export const POLL_INTERVAL_MS = Number(import.meta.env.VITE_POLL_INTERVAL_MS ?? 1000)

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
