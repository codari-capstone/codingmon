import type { Language, ProblemDetailView } from '@/api/types'
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
    <fieldset className="bg-muted m-0 inline-flex gap-1 rounded-full border-0 p-1">
      <legend className="sr-only">언어</legend>
      {languages.map(({ language }) => (
        <label
          key={language}
          className="text-muted-foreground hover:text-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-card has-focus-visible:outline-ring relative inline-flex h-control-sm cursor-pointer items-center rounded-full px-4 text-[15px] font-semibold transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 forced-colors:has-checked:outline-2"
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
