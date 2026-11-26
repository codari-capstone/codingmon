import type { Language, ProblemDetailView } from '@/api/types'
import { SlidingPill } from '@/components/SlidingPill'
import { LANGUAGE_LABEL } from './labels'

/**
 * 언어 선택 (SOLVE-04).
 *
 * 디자인은 회색 트랙 위 흰 칩(Tabs pill)이지만 역할은 라디오다 — 둘 중 하나를 고르는
 * 일이고, 탭처럼 패널을 바꾸지 않는다. 네이티브 라디오를 화면에서만 숨겨 두면 역할·상태·
 * 방향키 이동이 그대로 따라온다 (ProblemFilters의 체크박스와 같은 이유).
 *
 * 문제가 주는 언어만 띄운다. 계약의 `languages`는 그 버전이 지원하는 목록이고, 지원하지
 * 않는 언어로 제출하면 서버가 `LANGUAGE_NOT_SUPPORTED`로 거절한다.
 */
export function LanguagePicker({
  languages,
  value,
  onChange,
}: {
  languages: ProblemDetailView['languages']
  value: Language
  onChange: (next: Language) => void
}) {
  return (
    <fieldset className="bg-muted relative m-0 inline-flex gap-1 rounded-full border-0 p-1">
      <legend className="sr-only">언어</legend>
      {/* 고른 칸의 흰 면은 알약이 그린다. React는 checked를 속성(attribute)으로 쓰지 않아 알약이 볼 표시를 label에 단다 */}
      {/* 언어 목록이 바뀌면 알약만 새로 건다. 고른 표시를 단 채 새로 들어온 칸은 속성 변경이 없어 알약이 따라가지 못한다.
          fieldset 전체에 key를 걸면 라디오까지 새로 만들어져 키보드 포커스가 빠진다(#381 리뷰) */}
      <SlidingPill
        key={languages.map(({ language }) => language).join()}
        activeSelector="[data-checked]"
        className="shadow-card"
      />
      {languages.map(({ language }) => (
        <label
          key={language}
          data-checked={language === value || undefined}
          className="text-muted-foreground hover:text-foreground has-checked:text-foreground has-focus-visible:outline-ring relative inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-[15px] font-semibold transition-colors motion-reduce:transition-none has-focus-visible:outline-2 has-focus-visible:outline-offset-2 forced-colors:has-checked:outline-2"
        >
          <input
            type="radio"
            name="solve-language"
            value={language}
            checked={language === value}
            onChange={() => onChange(language)}
            // 칩 전체를 덮는 투명한 진짜 라디오. 누르는 곳이 곧 입력이라 역할·클릭·방향키가 그대로다
            className="absolute inset-0 m-0 cursor-pointer appearance-none rounded-full opacity-0"
          />
          {LANGUAGE_LABEL[language]}
        </label>
      ))}
    </fieldset>
  )
}
