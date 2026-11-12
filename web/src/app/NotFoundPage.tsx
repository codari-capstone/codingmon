import { Link, useLocation, useNavigate } from 'react-router'

import scene from '@/assets/scenes/notfound.png'
import { Button } from '@/components/ui/button'
import { ExceptionPage } from './ExceptionPage'

/** UX-04 404 페이지 */
export function Component() {
  const navigate = useNavigate()
  // 주소를 바로 열고 들어왔으면(key 'default') 돌아갈 앱 안의 페이지가 없다. 뒤로 가면 사이트를 떠난다
  const canGoBack = useLocation().key !== 'default'

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
