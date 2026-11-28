import { Link, useLocation, useNavigate } from 'react-router'

import scene from '@/assets/scenes/notfound.png'
import { Button } from '@/components/ui/button'
import { ExceptionPage } from './ExceptionPage'

/** UX-04 404 페이지 */
export function Component() {
  const navigate = useNavigate()
  useLocation() // 주소가 바뀌면 아래 값을 다시 읽는다
  // 앱 안에서 쌓은 기록이 있을 때만 뒤로 간다. location.key는 replace 이동(GitHub 로그인 복귀 등)에도
  // 새로 생겨 믿을 수 없다. BrowserRouter가 history.state에 남기는 idx는 replace하면 그대로라,
  // 0이면 바로 뒤가 앱 밖(다른 사이트·새 탭)이다.
  const canGoBack = ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0

  return (
    <ExceptionPage
      scene={scene}
      sceneWidth={340}
      sceneHeight={242}
      code="404"
      title="페이지를 찾을 수 없어요"
      description="주소가 바뀌었거나 삭제된 페이지예요. 돋보기로 샅샅이 찾아봤는데 없었어요."
      actions={
        <>
          <Button asChild>
            <Link to="/problems">문제 목록으로</Link>
          </Button>
          {canGoBack ? (
            <Button type="button" variant="secondary" onClick={() => void navigate(-1)}>
              이전 페이지
            </Button>
          ) : null}
        </>
      }
    />
  )
}
