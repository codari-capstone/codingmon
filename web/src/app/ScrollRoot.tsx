import { Outlet, ScrollRestoration } from 'react-router'

/**
 * 모든 화면의 최상위 라우트. 주소가 바뀌면 맨 위로 올리고, 뒤로 가기는 떠났던 위치로 돌린다.
 *
 * 쿼리만 바뀌어도 새 주소라 맨 위로 올라간다. 페이지 넘김은 그래서 따로 올리지 않는다.
 * 검색어·정렬·필터·언어처럼 제자리에서 쿼리를 바꾸는 곳은 `preventScrollReset`을 넘긴다.
 */
export function ScrollRoot() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
