/// <reference types="vite/client" />

// 스택 문서 §5 환경 변수. VITE_ 접두사가 붙은 값은 브라우저에서 누구나 볼 수 있으므로
// 비밀값은 절대 넣지 않는다.
//
// 목 모드는 환경 변수가 아니라 빌드 모드로 켠다 (`--mode mock`). main.tsx 참고.
interface ImportMetaEnv {
  /** 채점 진행률 폴링 간격(ms) */
  readonly VITE_POLL_INTERVAL_MS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
