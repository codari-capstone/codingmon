import { useRouteError } from 'react-router'

/**
 * 라우트에서 발생한 오류를 받는다.
 *
 * 가장 흔한 경우는 배포 후 열려 있던 탭이다. 화면마다 해시가 붙은 청크로 나뉘어 있어,
 * 새 버전이 올라가면 옛 청크가 404가 되고 dynamic import가 실패한다. 이때
 * 새로고침하면 새 번들을 받아 정상 동작하므로 그 안내를 보여 준다.
 *
 * 판정별 오류 문구와 전체 예외 화면(UX-02·UX-04)은 공통 처리 이슈에서 다듬는다.
 */
export function RouteErrorBoundary() {
  const error = useRouteError()
  const isChunkLoadFailure =
    error instanceof Error &&
    /dynamically imported module|Importing a module script failed/i.test(error.message)

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">
        {isChunkLoadFailure ? '새 버전이 배포되었습니다' : '문제가 발생했습니다'}
      </h1>
      <p className="text-muted-foreground">
        {isChunkLoadFailure
          ? '새로고침하면 최신 화면을 불러옵니다.'
          : '잠시 후 다시 시도해 주세요. 문제가 계속되면 팀에 알려 주세요.'}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium"
      >
        새로고침
      </button>
    </section>
  )
}
