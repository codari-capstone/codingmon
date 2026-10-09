import { useRouteError } from 'react-router'

import { ErrorState } from '@/components/ErrorState'

import { AppShell } from './AppShell'

/**
 * 라우트에서 발생한 오류를 받는다 (UX-02).
 *
 * 가장 흔한 경우는 화면 청크를 받지 못한 것이다. 모든 화면이 해시가 붙은 lazy 청크라,
 * 배포로 옛 청크가 404가 되거나 네트워크가 끊기면 dynamic import가 실패한다.
 * 그 경우 toUserMessage가 기본 문구를 주고, 서버가 RFC 9457로 내려준 오류는
 * 해당 문구로 바뀐다. 원인을 단정하지 않고 다시 시도하도록 안내한다.
 *
 * react-router의 ErrorBoundary는 그 라우트의 Component를 대체하므로,
 * AppShell로 직접 감싸지 않으면 상단바도 좌우 여백도 없이 그려진다.
 */
export function RouteErrorBoundary() {
  const error = useRouteError()

  return (
    <AppShell>
      <ErrorState problem={error} headingLevel={1} onRetry={() => window.location.reload()} />
    </AppShell>
  )
}
