import { cn } from 'cn'

export interface TableColumn<Row> {
  key: string
  header: React.ReactNode
  align?: 'left' | 'center' | 'right'
  width?: string
  /** 정렬 가능한 열의 머리글에 붙는다. 정렬 중인 열만 값을 준다 */
  ariaSort?: 'ascending' | 'descending' | 'none'
  /** 없으면 `row[key]`를 그대로 보여 준다 */
  render?: (row: Row) => React.ReactNode
}

interface TableProps<Row extends { id: string | number }> {
  columns: TableColumn<Row>[]
  rows: Row[]
  /** 행 전체가 링크일 때 */
  onRowClick?: (row: Row) => void
  /** 표의 이름. 화면 낭독기가 표를 구분하는 데 쓴다 */
  caption?: string
  className?: string
}

const ALIGN = { left: 'text-left', center: 'text-center', right: 'text-right' } as const

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
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn('group', onRowClick && 'cursor-pointer')}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    'group-hover:bg-muted border-b px-4 py-3.5 align-middle transition-colors group-last:border-b-0 first:group-hover:rounded-l-lg last:group-hover:rounded-r-lg',
                    ALIGN[c.align ?? 'left'],
                  )}
                >
                  {c.render ? c.render(row) : (row as Record<string, React.ReactNode>)[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
