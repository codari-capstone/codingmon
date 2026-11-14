import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { RadioGroup } from '@/components/ui/radio-group'
import { Select } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useReduceMotion } from '@/app/motion'
import { useTheme, type ThemePreference } from '@/app/useTheme'
import { CodeEditor } from '@/features/solve/CodeEditor'
import {
  EDITOR_LANGUAGES,
  FONT_SIZES,
  TAB_SIZES,
  updateEditorSettings,
  useEditorSettings,
} from '@/features/solve/editorSettings'
import { LANGUAGE_LABEL } from '@/features/solve/labels'
import { cn } from '@/lib/utils'
import { MY_CARD, MyLayout } from './MyLayout'

const THEMES: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'light', label: '라이트', description: '밝은 배경에 어두운 글자' },
  { value: 'dark', label: '다크', description: '어두운 배경, 밤에 눈이 편해요' },
  {
    value: 'system',
    label: '시스템 설정 따르기',
    description: '기기 설정에 맞춰 자동으로 바뀌어요',
  },
]

const PREVIEW =
  'def solution(nums):\n    best = nums[0]\n    for n in nums:\n        best = max(best, n)\n    return best\n'

const SELECTS = [
  {
    id: 'editor-language',
    label: '기본 언어',
    key: 'language',
    options: EDITOR_LANGUAGES.map((value) => ({ value, label: LANGUAGE_LABEL[value] })),
  },
  {
    id: 'editor-font-size',
    label: '글꼴 크기',
    key: 'fontSize',
    options: FONT_SIZES.map((value) => ({ value, label: `${value}px` })),
  },
  {
    id: 'editor-tab-size',
    label: '들여쓰기',
    key: 'tabSize',
    options: TAB_SIZES.map((value) => ({ value, label: `공백 ${value}칸` })),
  },
] as const

const SWITCHES = [
  { key: 'lineNumbers', label: '줄 번호 보기' },
  { key: 'closeBrackets', label: '괄호 자동으로 닫기' },
  {
    key: 'lineWrapping',
    label: '긴 줄 자동 줄바꿈',
    description: '가로 스크롤 없이 화면 폭에 맞춰 줄을 바꿔요.',
  },
] as const

/** 코드 에디터 설정 (UX-07). 바꾸면 이 기기에 저장되고 열려 있는 에디터에도 바로 적용된다. */
function EditorSection() {
  const settings = useEditorSettings()
  const [preview, setPreview] = useState(PREVIEW)
  return (
    <section aria-labelledby="editor-heading" className={cn(MY_CARD, 'gap-5')}>
      <div className="flex flex-col gap-1">
        <h2 id="editor-heading" className="text-foreground text-lg font-semibold">
          코드 에디터
        </h2>
        <p className="text-muted-foreground text-sm">문제 풀이 화면의 에디터에 적용돼요.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {SELECTS.map((it) => (
          <div key={it.id} className="flex flex-col gap-1.5">
            <label htmlFor={it.id} className="text-sm font-semibold">
              {it.label}
            </label>
            <Select
              id={it.id}
              value={settings[it.key]}
              onChange={(event) => {
                const raw = event.target.value
                // 언어만 글자고 나머지는 숫자다. 고를 수 있는 값은 위 목록뿐이다
                updateEditorSettings({ [it.key]: it.key === 'language' ? raw : Number(raw) })
              }}
            >
              {it.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ))}
      </div>
      {/* 실제 에디터라 고른 설정이 그대로 보인다. 써 봐도 저장되지 않는다 */}
      <CodeEditor
        language="PYTHON"
        label="설정 미리 보기"
        value={preview}
        onChange={setPreview}
        minHeight="0"
      />
      <div className="flex flex-col">
        {SWITCHES.map((it) => (
          <Switch
            key={it.key}
            label={it.label}
            description={'description' in it ? it.description : undefined}
            checked={settings[it.key]}
            onChange={(event) => updateEditorSettings({ [it.key]: event.target.checked })}
          />
        ))}
      </div>
    </section>
  )
}

/** 움직임 (UX-08). '맞혔을 때 축하 효과'는 끄고 켤 효과가 생기는 #248에서 더한다. */
function MotionSection() {
  const { reduce, followsDevice, setReduce, followDevice } = useReduceMotion()
  return (
    <section aria-labelledby="motion-heading" className={cn(MY_CARD, 'gap-2')}>
      <h2 id="motion-heading" className="text-foreground text-lg font-semibold">
        움직임
      </h2>
      <Switch
        label="애니메이션 줄이기"
        description={
          followsDevice
            ? "화면의 움직이는 효과를 줄여요. 지금은 기기의 '동작 줄이기' 설정을 따라요."
            : '화면의 움직이는 효과를 줄여요. 직접 고른 값을 쓰고 있어요.'
        }
        checked={reduce}
        onChange={(event) => setReduce(event.target.checked)}
      />
      {/* 한 번 고르면 기기 설정을 다시 따를 길이 없었다(#281 리뷰). 고른 값이 있을 때만 둔다 */}
      {followsDevice ? null : (
        <Button variant="link" className="self-start text-sm" onClick={followDevice}>
          기기 설정 따르기
        </Button>
      )}
    </section>
  )
}

/** 화면 설정 (UX-06·07·08). 고르면 바로 적용되고 이 기기에 저장된다. */
export function Component() {
  const { preference, setPreference } = useTheme()
  return (
    <MyLayout
      title="화면 설정"
      description="테마와 코드 에디터를 내 눈에 맞게 바꿔요. 바꾸면 바로 적용돼요."
      narrow
    >
      <section aria-labelledby="theme-heading" className={cn(MY_CARD, 'gap-5')}>
        <div className="flex flex-col gap-1">
          <h2 id="theme-heading" className="text-foreground text-lg font-semibold">
            테마
          </h2>
          <p className="text-muted-foreground text-sm">
            시스템을 고르면 컴퓨터의 라이트·다크 설정을 따라가요.
          </p>
        </div>
        <RadioGroup
          label="테마 고르기"
          name="theme"
          variant="card"
          options={THEMES}
          value={preference}
          onChange={setPreference}
        />
      </section>
      <EditorSection />
      <MotionSection />
    </MyLayout>
  )
}
