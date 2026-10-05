/// <reference types="vite/client" />

// 스택 문서 §5 환경 변수. VITE_ 접두사가 붙은 값은 브라우저에서 누구나 볼 수 있으므로
// 비밀값은 절대 넣지 않는다.
interface ImportMetaEnv {
  /** MSW 가짜 응답 사용 여부 */
  readonly VITE_USE_MOCK?: string
  /** 채점 진행률 폴링 간격(ms) */
  readonly VITE_POLL_INTERVAL_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
