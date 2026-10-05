import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App'
import './index.css'

/** 백엔드가 준비되기 전에는 MSW 가짜 응답으로 화면을 개발한다 (npm run dev:mock). */
async function enableMocking() {
  if (import.meta.env.VITE_USE_MOCK !== 'true') return

  const { worker } = await import('./mocks/browser')
  await worker.start({ onUnhandledRequest: 'bypass' })
}

function render() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

// 목 설정이 실패해도 화면은 띄운다. 그러지 않으면 빈 화면만 남아
// 원인을 알 수 없다. 목 응답이 없다는 것은 콘솔로 알린다.
enableMocking()
  .catch((error: unknown) => {
    console.error('[MSW] 목 API 시작 실패. 실제 API로 요청이 나갑니다.', error)
  })
  .finally(render)
