import { cn } from '@/lib/utils'

import { Icon } from '@/components/ui/icon'
import { useCopy } from '@/lib/useCopy'

/** 끝 개행 하나는 줄로 세지 않는다. 에디터가 저장한 `print(1)\n`이 빈 2번 줄을 만들지 않게 한다 */
function toLines(code: string): string[] {
  const lines = code.split('\n')
  return lines.length > 1 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines
}

interface CodeBlockProps {
  code: string
  /** 머리줄 글자. title이 우선 */
  title?: string
  language?: string
  lineNumbers?: boolean
  /** 강조할 줄 번호(1부터). AI 분석이 가리키는 줄 */
  highlight?: number[]
  /** 복사 버튼을 뺄 때 false */
  copyable?: boolean
  className?: string
}

/**
 * 코드나 예제 입출력을 보여 주는 남색 블록. 머리줄에 제목과 복사 버튼이 있다. 구문 색칠은 하지 않는다.
 * 정답 코드를 보여 주는 데 쓰지 않고, 코드를 고치는 자리에는 에디터를 쓴다.
 */
export function CodeBlock({
  code,
  title,
  language,
  lineNumbers,
  highlight,
  copyable = true,
  className,
}: CodeBlockProps) {
  const { copied, copy } = useCopy(code)
  const copyText = copied ? '복사됨' : '복사'

  const heading = title ?? language
  const bar = heading || copyable
  return (
    <figure
      className={cn(
        'bg-inverse text-inverse-foreground m-0 overflow-hidden rounded-lg dark:shadow-[inset_0_0_0_1px_var(--border)]',
        className,
      )}
    >
      {bar ? (
        <figcaption className="text-inverse-muted border-inverse-line flex h-11 items-center justify-between border-b pr-2 pl-[18px] text-[13px] font-semibold">
          <span>{heading ?? ''}</span>
          {copyable ? (
            <button
              type="button"
              onClick={() => void copy()}
              // 한 화면에 블록이 여럿이면 '복사, 복사'로만 읽혀 어느 것인지 모른다. 보이는 글자를 이름 끝에 둔다
              aria-label={heading ? `${heading} ${copyText}` : undefined}
              className="bg-inverse-raised text-inverse-foreground focus-visible:outline-inverse-accent hover:shadow-[inset_0_0_0_1px_var(--inverse-line)] inline-flex h-[30px] cursor-pointer items-center gap-1.5 rounded-full border-0 px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copyText}
            </button>
          ) : null}
        </figcaption>
      ) : null}
      <pre
        tabIndex={0}
        className="focus-visible:outline-inverse-accent m-0 overflow-x-auto px-[18px] py-4 font-mono text-sm leading-[1.7] whitespace-pre focus-visible:outline-2 focus-visible:-outline-offset-2"
      >
        {/*
          code를 가장 긴 줄 너비까지 늘린다. 그래야 줄 span(block)도 함께 넓어져, 가로로 스크롤한
          곳에서도 강조 줄의 배경과 띠가 끊기지 않는다.
        */}
        <code className="inline-block min-w-full align-top">
          {/* 줄 번호와 강조 줄은 서로 따로 쓸 수 있다. 둘 중 하나라도 있으면 줄마다 그린다 */}
          {lineNumbers || highlight?.length
            ? toLines(code).map((line, i) => (
                <span
                  key={i}
                  data-highlighted={highlight?.includes(i + 1) || undefined}
                  className={cn(
                    '-mx-[18px] block px-[18px]',
                    // 고대비에서는 배경·그림자가 지워지므로 왼쪽 테두리로 강조를 남긴다. 테두리만큼 여백을 줄여 글자 줄을 맞춘다
                    highlight?.includes(i + 1) &&
                      'bg-inverse-raised shadow-[inset_3px_0_0_var(--highlight)] forced-colors:border-l-4 forced-colors:border-solid forced-colors:pl-[14px]',
                  )}
                >
                  {lineNumbers ? (
                    <span
                      aria-hidden="true"
                      className="text-inverse-muted mr-3.5 inline-block w-7 text-right select-none"
                    >
                      {i + 1}
                    </span>
                  ) : null}
                  {line + '\n'}
                </span>
              ))
            : code}
        </code>
      </pre>
    </figure>
  )
}
