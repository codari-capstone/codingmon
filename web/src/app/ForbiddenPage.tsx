import { Link } from 'react-router'

import scene from '@/assets/scenes/forbidden.png'
import { Button } from '@/components/ui/button'
import { useLogout } from '@/features/auth/useLogout'
import { ExceptionPage } from './ExceptionPage'

/** UX-04 권한 없음 페이지. 권한 검사(COM-05)가 여기로 보낸다. */
export function Component() {
  // 로그인한 채로는 /login이 원래 화면으로 돌려보낸다. 다른 계정으로 들어가려면 먼저 로그아웃한다
  const { logout, isPending } = useLogout('/login')

  return (
    <ExceptionPage
      scene={scene}
      sceneWidth={380}
      sceneHeight={230}
      code="403"
      title="이 화면을 볼 권한이 없어요"
      description="관리자만 들어갈 수 있는 화면이에요. 로그인한 계정을 확인해 주세요."
      actions={
        <>
          <Button asChild>
            <Link to="/problems">문제 목록으로</Link>
          </Button>
          <Button type="button" variant="secondary" loading={isPending} onClick={logout}>
            다른 계정으로 로그인
          </Button>
        </>
      }
    />
  )
}
