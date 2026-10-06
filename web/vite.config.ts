import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // 개발 중에도 화면과 API가 같은 주소로 보이게 해 CORS·쿠키 문제를 피한다.
    // 운영의 ALB 경로 라우팅(/api/* -> API 서버)과 같은 구조다.
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // e2e는 Playwright가 맡는다
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
