import { Check, Copy } from 'lucide-react'

import type { ProblemDetailView } from '@/api/types'
import { Button } from '@/components/ui/button'
import { useCopy } from '@/lib/useCopy'

/**
 * 예제 하나를 클립보드로 (SOLVE-02).
 *
 * 눌렀는데 아무 일도 안 일어나면 복사됐는지 알 수 없어서 라벨을 잠깐 바꾼다. 색이나
 * 아이콘만 바꾸면 스크린 리더가 알 수 없으므로 글도 함께 바꾼다.
 * 복사·'복사됨' 유지 시간·실패 처리는 CodeBlock과 같은 `useCopy`가 맡는다.
 */
function CopyButton({ text, label }: { text: string; label: string }) {
  const { copied, copy } = useCopy(text)
  const Icon = copied ? Check : Copy

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={`${label} ${copied ? '복사됨' : '복사'}`}
      onClick={() => void copy()}
    >
      <Icon aria-hidden="true" />
      {copied ? '복사됨' : '복사'}
    </Button>
  )
}

function SampleBox({ title, label, text }: { title: string; label: string; text: string }) {
  return (
    // min-w-0: grid 칸이 긴 한 줄의 pre 폭까지 늘어나 화면을 가로로 밀지 않게 한다
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-muted-foreground text-[13px] font-semibold">{title}</h4>
        <CopyButton text={text} label={label} />
      </div>
      {/*
        예제는 공백과 줄바꿈이 뜻을 가진다. pre로 그대로 두고, 긴 줄은 줄바꿈 대신
        가로 스크롤로 보여 준다 — 임의로 꺾으면 어디가 한 줄인지 알 수 없다.
      */}
      <pre className="bg-muted text-foreground overflow-x-auto rounded-[12px] px-4 py-3.5 text-sm leading-relaxed">
        {text}
      </pre>
    </div>
  )
}

/** 공개 예제 입력·출력과 복사 버튼 (SOLVE-02). */
export function Samples({ samples }: { samples: ProblemDetailView['samples'] }) {
  if (samples.length === 0) return null

  return (
    <section className="flex flex-col gap-8">
      {/* 디자인은 '예제 N'만 보인다. 묶음 제목은 화면 낭독기의 제목 탐색용으로 둔다 */}
      <h2 className="sr-only">예제</h2>
      {samples.map((sample, index) => (
        <div key={index} className="flex flex-col gap-4">
          <h3 className="text-foreground text-lg font-semibold">예제 {index + 1}</h3>
          {/* 입력·출력을 나란히. 좁으면 위아래로 쌓는다 */}
          <div className="grid gap-3 sm:grid-cols-2">
            <SampleBox title="입력" label={`예제 ${index + 1} 입력`} text={sample.input} />
            <SampleBox title="출력" label={`예제 ${index + 1} 출력`} text={sample.output} />
          </div>
        </div>
      ))}
    </section>
  )
}
