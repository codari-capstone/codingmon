import type { RequestHandler } from 'msw'

/**
 * MSW 가짜 응답. 1주차에 확정한 OpenAPI 명세를 보고 화면별로 추가한다.
 * 모든 판정 종류와 AI 장애 같은 예외 화면도 여기서 미리 만들어 확인한다.
 *
 * 예시:
 *   http.get('/api/problems', () => HttpResponse.json({ content: [], totalElements: 0 }))
 */
export const handlers: RequestHandler[] = []
