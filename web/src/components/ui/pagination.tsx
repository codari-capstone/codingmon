import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

import { pageItems } from '@/lib/pagination'

/**
 * 목록의 페이지를 옮기는 번호 버튼 (디자인 시스템 Pagination, LIST-05).
 *
 * 링크가 아니라 버튼이다. 이동은 주소를 바꾸는 일이지만, 그 주소를 만드는 규칙은
 * 필터·검색어·정렬을 들고 있는 목록 화면에 있다. 여기서 href를 만들려면 그 규칙이 둘로 나뉜다.
 *
 * 한 페이지뿐이면 그리지 않는다. 다만 결과보다 뒤인 페이지에 와 있으면(page > total)
 * 돌아갈 길이 이것뿐이라 남긴다 (AdminProblemListPage).
 */
function Pagination({
  page,
  total,
  onChange,
  className,
}: {
  /** 1부터 센다 */
  page: number
  /** 전체 페이지 수 */
  total: number
  onChange: (page: number) => void
  className?: string
}) {
  if (total <= 1 && page <= 1) return null

  return (
    <nav
      aria-label="페이지"
      className={cn('flex flex-wrap items-center justify-center gap-1', className)}
    >
      <button
        type="button"
        aria-label="이전 페이지"
        className={PAGE_BUTTON}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft aria-hidden className="size-[18px]" />
      </button>

      {pageItems(page, total).map((item, index) =>
        item === null ? (
          // 접힌 자리. 누를 수 없는 장식이라 보조기기에서 숨긴다.
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className="min-w-6 text-center text-muted-foreground"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            // 번호만으로는 무엇의 번호인지 읽히지 않는다. 지금 페이지는 aria-current로 알린다.
            aria-label={`${item}페이지`}
            aria-current={item === page ? 'page' : undefined}
            className={PAGE_BUTTON}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        aria-label="다음 페이지"
        className={PAGE_BUTTON}
        disabled={page >= total}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight aria-hidden className="size-[18px]" />
      </button>
    </nav>
  )
}

// 40px 알약. 320px 폭에서도 번호가 붙지 않게 gap-1을 두고, 터치 영역은 44px에 조금 못 미치지만
// 이웃과 4px 떨어져 있어 WCAG 2.5.8(24px)은 넉넉히 넘는다. outline-none이 아니라 outline-hidden이다(#255 리뷰)
const PAGE_BUTTON =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-full px-2 text-sm font-semibold text-body-foreground tabular-nums outline-hidden transition-colors hover:not-disabled:not-aria-[current=page]:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring disabled:cursor-not-allowed disabled:text-disabled-foreground aria-[current=page]:bg-primary aria-[current=page]:text-primary-foreground'

export { Pagination }
