import type { Language } from '@/api/types'
import { Markdown } from '@/components/Markdown'
import { Icon } from '@/components/ui/icon'
import { BEGINNER_GUIDE } from '@/constants/beginnerGuide'
import { LANGUAGE_LABEL } from './labels'

/**
 * 입문자 안내 (SOLVE-07).
 *
 * 네이티브 `<details>`로 접는다. 펼치기·접기 상태와 키보드 조작이 전부 따라오고,
 * 꾸미기만 하면 된다 (ErrorState의 "서버 응답 원문"과 같은 방식).
 *
 * 처음에는 접어 둔다. 아는 사람에게는 화면을 가리는 덩어리이고, 모르는 사람은
 * 제목만 보고 열면 된다.
 */
export function BeginnerGuide({ language }: { language: Language }) {
  const guide = BEGINNER_GUIDE[language]

  return (
    // 디자인 시스템 Alert의 brand 모양(옅은 파랑 면 + 전구)을 접히는 안내에 입힌다
    <details className="bg-accent text-body-foreground rounded-lg px-4 text-sm">
      <summary className="text-primary-text flex min-h-12 cursor-pointer items-center gap-3 text-[15px] font-bold">
        <Icon name="bulb" size={20} />
        {`처음이신가요? ${LANGUAGE_LABEL[language]}로 표준 입력 읽는 법`}
      </summary>

      <div className="flex flex-col gap-3 pb-4 pl-8">
        {/* pre의 꾸밈은 Markdown과 같되 둥글기만 rounded-sm이다. 12px 면 안에 있어, 카드 위의 코드 블록(20px)처럼
            크게 두면 안쪽이 바깥보다 둥글다. 긴 줄은 자기 안에서 가로로 흐른다 */}
        <pre className="bg-card overflow-x-auto rounded-sm p-3 text-xs leading-relaxed">
          {guide.readingExample}
        </pre>

        <dl className="flex flex-col gap-2">
          {guide.terms.map(({ term, meaning }) => (
            <div key={term}>
              {/* 용어 이름에 `cin`처럼 코드가 섞인다. 지문과 같은 렌더러로 그린다 */}
              <dt className="font-medium">
                <Markdown className="[&_p]:my-0">{term}</Markdown>
              </dt>
              <dd className="text-muted-foreground">
                <Markdown className="[&_p]:my-0">{meaning}</Markdown>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  )
}
