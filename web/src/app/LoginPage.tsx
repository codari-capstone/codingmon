import { LogIn } from 'lucide-react'

import { EmptyState } from '@/components/EmptyState'

/**
 * 로그인 자리 (COM-01). 인증 방식은 #18에서 정해진다.
 *
 * 헤더의 로그인 버튼은 비로그인 상태에서 항상 보이는데, 이 라우트가 없으면
 * path '*'에 걸려 404로 떨어진다. 깨진 링크를 두지 않으려고 안내 화면만 둔다.
 */
export function Component() {
  return (
    <EmptyState
      icon={LogIn}
      // 이 화면의 제목이 이것뿐이다. 기본값(h2)으로 두면 h1 없는 화면이 된다.
      headingLevel={1}
      title="로그인 준비 중입니다"
      description="인증 방식이 정해지면 이 화면에서 로그인할 수 있습니다. 그때까지는 로그인 없이 문제를 둘러볼 수 있습니다."
      action={{ label: '문제 보러 가기', to: '/problems' }}
    />
  )
}
