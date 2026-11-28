import { useEffect } from 'react'
import { useLocation, useMatches } from 'react-router'

import { applyHead } from './applyHead'
import type { PageHandle } from './AppShell'

export const SITE_URL = 'https://codingmon.tech'
/** index.html의 정적 값과 같아야 한다. JS를 돌리지 않는 미리보기 봇은 그쪽을 읽는다(PageHead.test가 묶는다) */
export const DEFAULT_TITLE = 'Codingmon | 틀린 이유까지 알려 주는 코딩 연습장'
export const DEFAULT_DESCRIPTION =
  '문제를 풀고 제출하면 어느 줄에서 왜 틀렸는지 AI가 짚어 주고, 정답 대신 다음 한 걸음을 힌트로 알려 주는 코딩 연습장이에요. Python·C++로 풀어 보세요.'

/**
 * 정식 주소. 라우터는 대소문자를 가리지 않고 끝 슬래시도 받아서, `/Problems/`도 같은 화면이다.
 * 변형 주소마다 스스로를 정식 주소라 하면 검색엔진이 다른 페이지로 색인한다(#326 리뷰)
 */
function canonicalUrl(pathname: string): string {
  return `${SITE_URL}${pathname.toLowerCase().replace(/\/+$/, '') || '/'}`
}

/**
 * 화면별 제목·설명·검색 노출 (#309). 라우트 handle의 `title`·`description`·`noindex`를 읽는다.
 *
 * - 제목은 가장 깊은 화면의 것. `문제 목록 | Codingmon` 꼴이다
 * - noindex는 하나라도 있으면 건다. 로그인이 필요한 화면은 RequireAuth 라우트에 한 번 달아 아래가 모두 받는다
 * - canonical은 검색에 내보내는 화면에만, 쿼리를 뗀 정식 주소로 단다. index.html에 루트로 박으면 모든 화면이 홈의 사본이 된다
 */
export function PageHead() {
  const { pathname } = useLocation()
  const handles = useMatches().map((m) => m.handle as PageHandle | undefined)
  const title = handles.findLast((h) => h?.title)?.title
  const description = handles.findLast((h) => h?.description)?.description ?? DEFAULT_DESCRIPTION
  const noindex = handles.some((h) => h?.noindex)

  // 제목·설명은 React의 <title>·<meta>로 그리지 않는다. React는 index.html의 정적 태그를 지우지 않아
  // 같은 태그가 둘이 된다(#326 리뷰). 정적 태그의 내용을 바꾼다
  const fullTitle = title ? `${title} | Codingmon` : DEFAULT_TITLE
  useEffect(() => applyHead(fullTitle, description), [fullTitle, description])

  // 이 둘은 정적 태그가 없어 React 19가 head로 올려 그린다
  return noindex ? (
    <meta name="robots" content="noindex" />
  ) : (
    <link rel="canonical" href={canonicalUrl(pathname)} />
  )
}
