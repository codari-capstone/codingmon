import { useEffect } from 'react'
import { useSearchParams } from 'react-router'

import { pageCount, parsePage } from '@/features/problems/problemListParams'

/** 주소의 `?page=`를 1부터 센 번호로 읽고, 바꾸는 함수를 준다. 첫 페이지는 주소에 쓰지 않는다. */
export function usePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const page = parsePage(searchParams.get('page'))

  function setPage(next: number, replace = false) {
    setSearchParams(next === 1 ? {} : { page: String(next) }, { replace })
  }

  return [page, setPage] as const
}

/**
 * 결과보다 뒤인 페이지를 마지막 페이지로 되돌린다 (손으로 고친 주소, 지워진 옛 링크).
 * 서버는 오류가 아니라 빈 목록을 주므로 화면이 알아차려야 한다. replace로 바꿔야
 * 뒤로가기가 이 주소로 돌아와 되돌리기를 반복하지 않는다 (ProblemListPage와 같은 이유).
 *
 * @returns 되돌리는 중이면 true — 그동안 빈 표를 그리지 않는다.
 */
export function useHealPage(
  page: number,
  totalElements: number | undefined,
  setPage: (page: number, replace?: boolean) => void,
): boolean {
  const last = totalElements === undefined ? 1 : pageCount(totalElements)
  const outOfRange = totalElements !== undefined && totalElements > 0 && page > last

  useEffect(() => {
    if (outOfRange) setPage(last, true)
    // setPage는 렌더마다 새로 만들어지지만 같은 일을 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outOfRange, last])

  return outOfRange
}
