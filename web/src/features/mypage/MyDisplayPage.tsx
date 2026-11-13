import { RadioGroup } from '@/components/ui/radio-group'
import { useTheme, type ThemePreference } from '@/app/useTheme'
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

/**
 * 화면 설정 (UX-06). 고르면 바로 적용되고 이 기기에 저장된다(ThemeProvider).
 * 디자인의 코드 에디터·움직임 설정은 #249에서 더한다.
 */
export function Component() {
  const { preference, setPreference } = useTheme()
  return (
    <MyLayout
      title="화면 설정"
      description="테마를 내 눈에 맞게 바꿔요. 바꾸면 바로 적용돼요."
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
    </MyLayout>
  )
}
