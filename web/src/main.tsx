import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'

/**
 * 목 모드는 빌드 모드 하나로만 켠다 (`vite --mode mock`, `vite build --mode mock`).
 *
 * VITE_USE_MOCK 환경 변수를 같이 쓰지 않는 이유: Vite는 `.env`를 모든 모드에서 읽으므로,
 * 누군가 `.env`에 `VITE_USE_MOCK=true`를 두고 `npm run build`를 하면 운영 번들이
 * MSW 워커를 시작하는 상태로 나간다. 스위치를 한 곳으로 모은다.
 */
const USE_MOCK = import.meta.env.MODE === 'mock'

async function enableMocking() {
  if (!USE_MOCK) return

  const { worker } = await import('./mocks/browser')
  await worker.start({ onUnhandledRequest: 'bypass' })
}

async function start() {
  try {
    await enableMocking()
  } catch (error) {
    // 목 설정이 실패해도 화면은 띄운다. 그러지 않으면 빈 화면만 남아 원인을 알 수 없다.
    console.error('[MSW] 목 API 시작 실패. 실제 API로 요청이 나갑니다.', error)
  }

  // App을 여기서 동적으로 불러온다. 정적 import면 모듈 평가 시점에
  // createBrowserRouter(...).initialize()가 돌아, 초기 화면의 loader 요청이
  // MSW 워커가 켜지기 전에 나가 프록시로 빠진다.
  const { App } = await import('./app/App')

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
