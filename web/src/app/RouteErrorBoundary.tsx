/**
 * 라우트에서 발생한 오류를 받는다.
 *
 * 가장 흔한 경우는 화면 청크를 받지 못한 것이다. 모든 화면이 해시가 붙은 lazy 청크라,
 * 배포로 옛 청크가 404가 되거나 네트워크가 끊기면 dynamic import가 실패한다.
 * 브라우저가 두 경우에 같은 메시지를 던져 원인을 가릴 수 없으므로,
 * 원인을 단정하지 않고 다시 시도하도록만 안내한다.
 *
 * 판정별 오류 문구와 전체 예외 화면(UX-02·UX-04)은 공통 처리 이슈에서 다듬는다.
 */
export function RouteErrorBoundary() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">화면을 불러오지 못했습니다</h1>
      <p className="text-muted-foreground">
        새로고침해 주세요. 계속 같은 화면이 나오면 네트워크 연결을 확인하고 팀에 알려 주세요.
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
