import { setupServer } from 'msw/node'

import { handlers } from './handlers'

/** Vitest에서 쓰는 가짜 서버. 브라우저와 같은 handlers를 재사용한다. */
export const server = setupServer(...handlers)
