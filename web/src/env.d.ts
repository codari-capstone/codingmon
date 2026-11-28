/// <reference types="vite/client" />

// 스택 문서 §5 환경 변수. VITE_ 접두사가 붙은 값은 브라우저에서 누구나 볼 수 있으므로
// 비밀값은 절대 넣지 않는다.
//
// 목 모드는 환경 변수가 아니라 빌드 모드로 켠다 (`--mode mock`). main.tsx 참고.
interface ImportMetaEnv {
  /** 채점 진행률 폴링 간격(ms) */
  readonly VITE_POLL_INTERVAL_MS?: string
  /** 포트원 상점 ID (PAY-01). 공개 값이다. 비어 있으면 결제 버튼이 '결제 설정이 아직 준비되지 않았어요'를 띄운다 */
  readonly VITE_PORTONE_STORE_ID?: string
  /** 포트원 채널 키(토스페이먼츠 테스트 채널). 공개 값이다. API Secret은 서버에만 둔다 */
  readonly VITE_PORTONE_CHANNEL_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
