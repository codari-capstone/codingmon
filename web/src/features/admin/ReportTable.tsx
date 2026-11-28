import { Link } from 'react-router'

import type { AdminReportSummary } from '@/api/types'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { REPORT_TYPE_LABEL } from '@/features/problems/labels'
import { cn } from '@/lib/utils'
import { REPORT_STATUS_LABEL, REPORT_STATUS_TONE } from './labels'

const THIS_YEAR = new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric' })
const OTHER_YEAR = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
})

/** 시안은 '11월 10일'이다. 올해가 아니면 연도를 붙인다(formatSubmittedAt과 같은 선택) */
function formatReportedOn(iso: string, now = new Date()) {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return '—'
  return (at.getFullYear() === now.getFullYear() ? THIS_YEAR : OTHER_YEAR).format(at)
}

/** 신고자. 회원 상세(ADM-15)로 간다. 탈퇴했으면 둘 다 null이고 글자만 남는다(계약) */
export function Reporter({ id, nickname }: { id: number | null; nickname: string | null }) {
  if (id === null || nickname === null) return <>탈퇴한 회원</>
  return (
    <Link
      to={`/admin/members/${id}`}
      className="hover:text-primary-text break-keep [overflow-wrap:anywhere] hover:underline"
    >
      {nickname}
    </Link>
  )
}

/** 신고 표 (ADM-13 목록, ADM-12 대시보드의 최근 신고). 두 시안의 열이 같다 */
export function ReportTable({ reports }: { reports: AdminReportSummary[] }) {
  return (
    // 좁은 화면에서는 열을 짜내지 않고 표 안에서 가로로 민다(문제 목록과 같다)
    <Table className="min-w-[720px]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">번호</TableHead>
          <TableHead>문제</TableHead>
          <TableHead className="w-40">유형</TableHead>
          <TableHead className="w-32">신고자</TableHead>
          <TableHead className="w-28">신고일</TableHead>
          <TableHead className="w-28">상태</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {reports.map((report) => (
          <TableRow key={report.id}>
            <TableCell className="text-muted-foreground tabular-nums">{report.id}</TableCell>
            <TableCell className="font-medium">
              {/*
                시안처럼 제목이 신고 상세로 간다. 같은 문제의 신고가 여럿이라 이름에 번호를 붙여 가른다.
                문제가 지워졌으면 회색 '(삭제된 문제)'를 붙인다 — 문제로 가는 길은 상세에도 없다(계약)
              */}
              <Link
                to={`/admin/reports/${report.id}`}
                aria-label={`신고 ${report.id}번 · ${
                  report.problemId === null ? '(삭제된 문제) ' : ''
                }${report.problemTitle}`}
                className={cn(
                  'hover:text-primary-text break-keep [overflow-wrap:anywhere] hover:underline',
                  report.problemId === null && 'text-muted-foreground',
                )}
              >
                {report.problemId === null ? '(삭제된 문제) ' : ''}
                {report.problemTitle}
              </Link>
            </TableCell>
            <TableCell>{REPORT_TYPE_LABEL[report.type]}</TableCell>
            <TableCell className={cn(report.reporterNickname === null && 'text-muted-foreground')}>
              <Reporter id={report.reporterId} nickname={report.reporterNickname} />
            </TableCell>
            <TableCell className="text-muted-foreground tabular-nums">
              {formatReportedOn(report.createdAt)}
            </TableCell>
            <TableCell>
              <Badge tone={REPORT_STATUS_TONE[report.status]}>
                {REPORT_STATUS_LABEL[report.status]}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
