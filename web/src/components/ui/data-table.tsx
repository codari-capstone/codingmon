import { cn } from '@/lib/utils'

interface ColumnBase {
  header: React.ReactNode
  align?: 'left' | 'center' | 'right'
  width?: string
  /** 정렬 가능한 열의 머리글에 붙는다. 정렬 중인 열만 값을 준다 */
  ariaSort?: 'ascending' | 'descending' | 'none'
}

/**
 * render가 없으면 key가 행의 필드 이름이어야 한다 — 오타가 난 열이 빈 칸으로 조용히 나오지 않게 한다.
 * render가 있으면 key는 열 이름일 뿐이다.
 */
export type TableColumn<Row> = ColumnBase &
  (
    | { key: Extract<keyof Row, string>; render?: (row: Row) => React.ReactNode }
    | { key: string; render: (row: Row) => React.ReactNode }
  )

interface TableProps<Row extends { id: string | number }> {
  columns: TableColumn<Row>[]
  rows: Row[]
  /** 행 전체가 링크일 때. 행이 Tab으로 닿고 Enter·Space로도 열린다 */
  onRowClick?: (row: Row) => void
  /** 표의 이름. 화면 낭독기가 표를 구분하는 데 쓴다 */
  caption?: string
  className?: string
}

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const

// 칸 안의 조작 요소. 여기서 시작한 클릭·키는 그 요소의 것이라 행 클릭으로 올리지 않는다
const CONTROL = 'a, button, input, select, textarea, summary, label, [role="button"], [tabindex]'

/** 객체·배열 값을 그대로 넣으면 렌더가 깨지므로, render 없는 열은 글자로 바꿔 보여 준다 */
function cellText(value: unknown): React.ReactNode {
  if (value == null) return ''
  return typeof value === 'string' || typeof value === 'number' ? value : String(value)
}

/**
 * 디자인 시스템의 Table: `columns`·`rows`를 받는 데이터형 표. 줄 사이에 얇은 선이 있고 올리면 옅은 면이 깔린다.
 *
 * 기존 조합형(`ui/table.tsx`의 TableRow·TableCell)은 화면 이슈(#235·#238·#242)에서 화면을 옮기면서
 * 이 표로 바꾸고, 다 옮기면 지운다.
 *
 * 좁은 화면에서는 가로 스크롤이 정답이다 — 스크롤은 바깥 상자가 받아 문서가 넘치지 않게 한다.
 * 표는 `Card padding="sm"` 안에 두고, 칸 안에 버튼을 여러 개 두지 않는다.
 */
export function Table<Row extends { id: string | number }>({
  columns,
  rows,
  onRowClick,
  caption,
  className,
}: TableProps<Row>) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="text-body-foreground w-full border-separate border-spacing-0 text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                aria-sort={c.ariaSort}
                style={{ width: c.width }}
                className={cn(
                  'text-muted-foreground h-10 border-b px-4 text-xs font-semibold whitespace-nowrap',
                  ALIGN[c.align ?? 'left'],
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={
                onRowClick
                  ? (e) => {
                      // 행 자신도 tabindex라 CONTROL에 걸린다. 행이 아닌 조작 요소에서 왔을 때만 건너뛴다
                      const control = (e.target as Element).closest(CONTROL)
                      if (!control || control === e.currentTarget) onRowClick(row)
                    }
                  : undefined
              }
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.target !== e.currentTarget) return
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onRowClick(row)
                      }
                    }
                  : undefined
              }
              className={cn(
                'group',
                onRowClick &&
                  'focus-visible:outline-ring cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2',
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'group-hover:bg-muted border-b px-4 py-3.5 align-middle transition-colors group-last:border-b-0 first:group-hover:rounded-l-lg last:group-hover:rounded-r-lg',
                    onRowClick && 'group-focus-visible:bg-muted',
                    ALIGN[c.align ?? 'left'],
                  )}
                >
                  {c.render ? c.render(row) : cellText((row as Record<string, unknown>)[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
