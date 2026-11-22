import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query'

import type { Subscription } from '@/api/types'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { changeSubscription, SUBSCRIPTION_KEY, type SubscriptionAction } from './subscriptionQuery'

export type ActionMutation = UseMutationResult<Subscription, Error, SubscriptionAction>

/** 처리가 끝나면 버튼이 바뀌어(해지 → 해지 취소) 포커스가 사라진다. 플랜 이름으로 옮겨 결과를 읽게 한다 */
export const PLAN_TITLE_ID = 'subscription-plan-title'

/** 해지·해지 취소·주기 바꾸기 (MY-06). 응답이 바뀐 구독이라 캐시에 바로 넣는다 */
export function useSubscriptionAction(): ActionMutation {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: changeSubscription,
    onSuccess: async (next) => {
      // 먼저 나간 구독 조회가 늦게 끝나 바뀌기 전 값으로 덮지 않게 취소한다(결제 화면과 같다)
      await queryClient.cancelQueries({ queryKey: SUBSCRIPTION_KEY })
      queryClient.setQueryData(SUBSCRIPTION_KEY, next)
      document.getElementById(PLAN_TITLE_ID)?.focus()
    },
    // 오프라인이면 기본값('online')은 요청을 멈춘 채 처리 중으로 남겨 창을 닫을 수 없다. 바로 실패시킨다(#357 리뷰)
    networkMode: 'always',
    onError: (error) => {
      forgetSessionIfUnauthorized(queryClient, error)
      // 409(다른 탭에서 해지·기간 끝남)든 400(갱신으로 주기가 이미 바뀜)이든 화면이 본 상태가 낡았을 수 있다.
      // 새로 받지 않으면 같은 버튼이 같은 오류를 되풀이한다(#357 리뷰)
      void queryClient.invalidateQueries({ queryKey: SUBSCRIPTION_KEY })
    },
  })
}
