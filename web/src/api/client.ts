import createClient from 'openapi-fetch'

import type { paths } from './schema'

/**
 * 모든 API 호출은 이 클라이언트를 거친다. 경로·파라미터·응답 타입이
 * OpenAPI 명세에서 생성한 타입으로 자동 검사된다.
 *
 * baseUrl을 상대 경로로 두는 이유: 개발에서는 Vite 프록시가, 운영에서는 ALB가
 * /api 요청을 Spring Boot로 넘긴다. 화면과 API가 같은 도메인이라 쿠키·CORS 설정이 단순하다.
 */
export const api = createClient<paths>({
  baseUrl: '/',
  credentials: 'same-origin',
})
