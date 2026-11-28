import { Link } from 'react-router'

import { Button } from '@/components/ui/button'

/**
 * 비로그인은 가입, 로그인한 사용자는 문제 목록 (LAND-02, PRICE-03). 세션을 모르는 동안은 자리만 잡는다.
 * 랜딩과 요금제가 같이 쓴다. 한 곳만 고치면 두 화면의 [무료로 시작하기]가 다른 곳으로 간다(#333 리뷰)
 */
export function StartButton({
  signedIn,
  variant = 'accent',
  fullWidth = false,
}: {
  signedIn: boolean | undefined
  variant?: 'accent' | 'secondary'
  fullWidth?: boolean
}) {
  if (signedIn === undefined) {
    return (
      <Button
        size="lg"
        variant={variant}
        fullWidth={fullWidth}
        aria-hidden
        tabIndex={-1}
        className="invisible"
      >
        무료로 시작하기
      </Button>
    )
  }
  return (
    <Button asChild size="lg" variant={variant} fullWidth={fullWidth}>
      {signedIn ? (
        <Link to="/problems">문제 풀러 가기</Link>
      ) : (
        <Link to="/signup">무료로 시작하기</Link>
      )}
    </Button>
  )
}
