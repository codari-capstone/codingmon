import { Moon, Sun } from 'lucide-react'

import { useTheme } from '@/app/useTheme'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  const isDark = theme === 'dark'

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
    >
      {isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
      <span className="hidden sm:inline">{isDark ? '라이트' : '다크'}</span>
    </Button>
  )
}
