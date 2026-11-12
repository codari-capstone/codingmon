import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Link } from 'react-router'

import type { Difficulty, ProblemSummary } from '@/api/types'
import { StatusText } from '@/components/StatusText'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, type TableColumn } from '@/components/ui/data-table'
import { DIFFICULTY_LABEL, SOLVE_STATUS_LABEL, SOLVE_STATUS_TONE } from './labels'
import type { SortDirection, SortField } from './problemListParams'

interface ProblemTableProps {
  problems: ProblemSummary[]
  /** 비로그인이면 false. 열과 셀을 아예 만들지 않는다 (COM-05). */
  showSolveStatus: boolean
  sortField: SortField
  sortDirection: SortDirection
  onSort: (field: SortField) => void
}

const DIFFICULTY_BARS: Record<Difficulty, number> = { EASY: 1, MEDIUM: 2, HARD: 3 }

/** 막대 세 칸 중 몇 칸이 찼는지로 난이도를 보인다. 뜻은 옆 글자가 전하고 막대는 장식이다 */
function DifficultyLevel({ difficulty }: { difficulty: Difficulty }) {
  const filled = DIFFICULTY_BARS[difficulty]
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span aria-hidden="true" className="inline-flex gap-[3px]">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={`h-3.5 w-1.5 rounded-[3px] ${bar <= filled ? 'bg-primary' : 'bg-border'}`}
          />
        ))}
      </span>
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  )
}

function ariaSort(active: boolean, direction: SortDirection) {
  if (!active) return 'none' as const
  return direction === 'asc' ? ('ascending' as const) : ('descending' as const)
}

export function ProblemTable({
  problems,
  showSolveStatus,
  sortField,
  sortDirection,
  onSort,
}: ProblemTableProps) {
  function sortable(field: SortField, label: string, width: string): TableColumn<ProblemSummary> {
    const active = sortField === field
    const Icon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown
    return {
      key: field,
      width,
      ariaSort: ariaSort(active, sortDirection),
      header: (
        // 머리글 글자 시작선을 다른 열과 맞춘다(버튼 안쪽 여백만큼 당긴다)
        <Button
          variant="ghost"
          size="sm"
          className="-ml-3 px-3 text-xs"
          onClick={() => onSort(field)}
        >
          {label}
          <Icon aria-hidden="true" className="size-3.5" />
        </Button>
      ),
    }
  }

  const columns: TableColumn<ProblemSummary>[] = [
    {
      ...sortable('id', '번호', '88px'),
      render: (problem) => <span className="text-muted-foreground tabular-nums">{problem.id}</span>,
    },
    {
      key: 'title',
      header: '제목',
      render: (problem) => (
        <Link
          to={`/problems/${problem.id}`}
          className="text-foreground hover:text-primary-text font-semibold whitespace-nowrap hover:underline"
        >
          {problem.title}
        </Link>
      ),
    },
    {
      ...sortable('difficulty', '난이도', '120px'),
      render: (problem) => <DifficultyLevel difficulty={problem.difficulty} />,
    },
    {
      key: 'tags',
      header: '개념',
      render: (problem) => (
        <span className="flex flex-wrap gap-1.5">
          {problem.tags.map((tag) => (
            <Badge key={tag.slug}>{tag.name}</Badge>
          ))}
        </span>
      ),
    },
  ]

  if (showSolveStatus) {
    columns.push({
      key: 'solveStatus',
      header: '풀이 상태',
      width: '110px',
      render: (problem) =>
        problem.solveStatus ? (
          <StatusText tone={SOLVE_STATUS_TONE[problem.solveStatus]}>
            {SOLVE_STATUS_LABEL[problem.solveStatus]}
          </StatusText>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    })
  }

  return <Table columns={columns} rows={problems} />
}
