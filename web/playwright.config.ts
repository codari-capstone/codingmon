import { defineConfig, devices } from '@playwright/test'

/**
 * 스택 문서 §6: '제출 → 판정 → AI 분석 → 힌트' 시연 흐름을 MSW 모드에서 자동 검사한다.
 * 백엔드 없이 돌 수 있어 CI에서 그대로 쓴다.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    // 4173(vite preview 기본값)을 쓰면 안 된다. 로컬에서 reuseExistingServer가 켜져 있어,
    // npm run preview(운영 빌드)를 띄워 둔 채 e2e를 돌리면 목 빌드를 만들지 않고
    // 그 서버를 재사용해 MSW 없는 번들을 검사한다.
    baseURL: 'http://localhost:4178',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // 빌드 결과를 preview로 띄워 운영과 같은 정적 파일을 검사한다.
    // dist/는 항상 운영 빌드만 담도록 E2E는 별도 폴더에 빌드한다.
    // 그러지 않으면 e2e 직후 dist/에 MSW가 섞인 번들이 남는다.
    command:
      'npm run build -- --mode mock --outDir dist-e2e && npm run preview -- --outDir dist-e2e --port 4178',
    url: 'http://localhost:4178',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
