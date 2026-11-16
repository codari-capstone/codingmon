import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import { api } from '@/api/client'
import { fail } from '@/api/fail'
import type { ProblemDetailView, ReportInput, ReportType } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { RadioGroup } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { problemMessage } from '@/features/auth/problemCode'
import { forgetSessionIfUnauthorized } from '@/features/auth/session'
import { REPORT_TYPE_LABEL } from '@/features/problems/labels'
import { REPORT_CONTENT_MAX, reportLength } from './reportRules'

const TYPE_OPTIONS = (Object.keys(REPORT_TYPE_LABEL) as ReportType[]).map((value) => ({
  value,
  label: REPORT_TYPE_LABEL[value],
}))

/**
 * [문제 신고] (SOLVE-12). 유형과 내용을 써서 관리자에게 알린다. 보낸 신고는 학습자가 다시 볼 수 없다(계약: 204).
 * 내용은 받은 그대로 1,000자까지, 앞뒤 공백을 뗀 뒤 1자 이상이어야 한다 — 서버와 같은 기준으로 먼저 막는다.
 */
export function ReportProblem({ problem }: { problem: ProblemDetailView }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ReportType>()
  const [content, setContent] = useState('')
  const contentId = useId()
  const queryClient = useQueryClient()

  const send = useMutation({
    // 보낼 값을 인자로 받는다. 렌더 때의 type을 붙잡아 `type!`로 믿으면 다른 길로 부를 때 빈 유형이 간다
    mutationFn: async (input: ReportInput) => {
      const result = await api.POST('/api/problems/{id}/reports', {
        params: { path: { id: problem.id } },
        body: input,
      })
      if (!result.response.ok) fail(result)
    },
    onError: (error) => forgetSessionIfUnauthorized(queryClient, error),
  })

  const length = reportLength(content)
  const canSend = type !== undefined && content.trim().length > 0 && length <= REPORT_CONTENT_MAX

  // 다시 열 때 지난 신고를 보냈으면 새 신고로 시작한다. 닫을 때 비우지 않는 까닭: 보내는 중에 닫고
  // 그 뒤 성공하면 닫을 때는 아직 성공이 아니라, 다시 열었을 때 '보냈어요'가 남았다(코드 리뷰).
  // 보내지 않았으면 쓰던 것을 남긴다 — 잘못 눌러 닫아도 다시 쓰지 않게
  const openDialog = () => {
    if (send.isSuccess) {
      setType(undefined)
      setContent('')
      send.reset()
    }
    setOpen(true)
  }
  const close = () => setOpen(false)
  // 값을 고치면 지난 서버 오류는 더 맞지 않는다. 다시 보내기 전까지 남기면 고친 글도 틀린 것처럼 보인다
  const clearError = () => {
    if (send.isError) send.reset()
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={openDialog}>
        문제 신고
      </Button>
      {/*
        대화상자는 하나다. 보낸 뒤 창을 따로 두면 그 창이 새로 생기면서, 닫을 때 포커스를 돌려줄
        [문제 신고] 버튼을 기억하지 못한다(Modal은 열리는 순간의 포커스를 기억한다)
      */}
      <Modal
        open={open}
        // 시안(SolveReport)의 폭이다. md(460)는 유형 카드 두 줄이 빽빽하고 lg(640)는 넓다
        className="max-w-[560px]"
        onClose={close}
        {...(send.isSuccess
          ? {
              align: 'center' as const,
              media: (
                <span className="bg-success-soft text-success-text inline-flex size-14 items-center justify-center rounded-full">
                  <Icon name="check" size={28} className="[&_path]:stroke-[3]" />
                </span>
              ),
              title: '신고를 보냈어요',
              description: '알려 주셔서 고마워요. 관리자가 확인하고 고칠게요.',
              footer: <Button onClick={close}>문제로 돌아가기</Button>,
            }
          : {
              title: '문제 신고',
              description: (
                <>
                  <b className="text-foreground font-semibold">{problem.title}</b>{' '}
                  <span className="font-mono">v{problem.versionNo}</span> · 이상한 점을 알려 주시면
                  관리자가 확인해 고쳐요.
                </>
              ),
              footer: (
                <>
                  <Button variant="secondary" className="sm:flex-1" onClick={close}>
                    취소
                  </Button>
                  <Button
                    className="sm:flex-1"
                    disabled={!canSend}
                    loading={send.isPending}
                    onClick={() => type && send.mutate({ type, content })}
                  >
                    신고 보내기
                  </Button>
                </>
              ),
            })}
      >
        {send.isSuccess ? null : (
          <div className="flex flex-col gap-5">
            <RadioGroup
              label="어떤 문제인가요?"
              name="report-type"
              variant="card"
              options={TYPE_OPTIONS}
              value={type}
              onChange={(next) => {
                setType(next)
                clearError()
              }}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor={contentId} className="text-foreground text-sm font-semibold">
                자세한 내용
              </label>
              <Textarea
                id={contentId}
                rows={5}
                placeholder="예: 예제 2의 출력이 문제 설명과 달라요."
                value={content}
                onChange={(event) => {
                  setContent(event.target.value)
                  clearError()
                }}
                aria-invalid={length > REPORT_CONTENT_MAX || undefined}
                aria-describedby={`${contentId}-count`}
              />
              <span
                id={`${contentId}-count`}
                className={`self-end text-xs tabular-nums ${
                  length > REPORT_CONTENT_MAX ? 'text-destructive-text' : 'text-muted-foreground'
                }`}
              >
                {length.toLocaleString()} / {REPORT_CONTENT_MAX.toLocaleString()}
              </span>
            </div>
            <p className="text-muted-foreground text-[13px]">보낸 신고는 다시 볼 수 없어요.</p>
            {send.isError ? (
              <p role="alert" className="text-destructive-text text-sm">
                {problemMessage(send.error)}
              </p>
            ) : null}
          </div>
        )}
      </Modal>
    </>
  )
}
