import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * 라벨·설명·오류를 한 벌로 감싼다 (ADM-02·03).
 *
 * 로그인·가입 폼이 칸마다 쓰는 세 줄(`label` + 입력칸 + `p.text-destructive-text`)과 같은
 * 모양이다. 거기서는 칸이 둘뿐이라 펼쳐 썼지만 이 폼은 열 칸이 넘어 한 곳에 모았다.
 * 네이티브 `label`을 쓰는 것도 같은 이유다 — `@/components/ui`에 label이 없고,
 * `htmlFor`만으로 입력칸과 이어진다.
 */
export function Field({
  id,
  label,
  hint,
  error,
  alignAt,
  children,
}: {
  id: string
  label: string
  /** 칸 아래가 아니라 위에 둔다. 입력하기 전에 읽어야 하는 말이다. */
  hint?: ReactNode
  error?: string
  /**
   * 나란히 놓인 칸(ALIGNED_ROW)의 입력칸 높이를 맞춘다. 이 폭부터 '라벨·도움말 / 입력칸 / 오류'를
   * 부모 격자의 세 줄(subgrid)에 올린다 — 도움말이 한 칸에만 있거나 오류가 한 칸에만 떠도
   * 입력칸은 같은 줄에 선다. 바닥 맞춤(items-end)은 오류 문구까지 바닥에 넣어 어긋났다(#289 리뷰).
   */
  alignAt?: 'sm' | 'md'
  children: ReactNode
}) {
  return (
    <div className={cn('flex flex-col gap-1.5', alignAt && SUBGRID[alignAt])}>
      {/*
        라벨과 도움말을 한 덩이로 둔다. 같은 줄의 다른 칸보다 짧으면 아래에 붙어 입력칸 바로 위에 온다.
        self-end는 격자(subgrid)일 때만 건다 — 세로로 쌓는 flex에서는 '오른쪽 끝'이 돼 라벨이 오른쪽으로 간다
      */}
      <div className={cn('flex flex-col gap-1.5', alignAt && HEADER_END[alignAt])}>
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
        {hint === undefined ? null : <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      {children}
      {error === undefined ? null : (
        <p className={cn('text-destructive-text text-sm', alignAt && ERROR_GAP[alignAt])}>
          {error}
        </p>
      )}
    </div>
  )
}

/*
  격자일 때는 줄 간격(gap-y)을 두지 않고, 같은 6px을 라벨 덩이 아래·오류 위 여백으로 준다.
  줄 간격으로 두면 오류가 없어 셋째 줄 높이가 0이어도 그 앞 간격 6px이 남아, 나란한 줄 아래만
  다른 칸보다 6px 넓어졌다(#289 리뷰). 여백은 오류가 있을 때만 생긴다.
*/
const SUBGRID = {
  // 칸 자체의 gap-1.5도 0으로 — 남기면 subgrid가 그 차이의 절반(3px)을 여백으로 더한다
  sm: 'sm:grid sm:row-span-3 sm:grid-rows-subgrid sm:gap-0',
  md: 'md:grid md:row-span-3 md:grid-rows-subgrid md:gap-0',
} as const

const HEADER_END = { sm: 'sm:self-end sm:pb-1.5', md: 'md:self-end md:pb-1.5' } as const

const ERROR_GAP = { sm: 'sm:pt-1.5', md: 'md:pt-1.5' } as const
