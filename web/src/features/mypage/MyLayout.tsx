import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'
import { MyNav } from './MyNav'

/** 마이페이지 화면들의 카드 (디자인 `mp-card`: 안쪽 28·32px, 둥근 모서리 20px) */
export const MY_CARD = 'bg-card flex flex-col rounded-lg border p-6 sm:px-8 sm:py-7'

/**
 * 마이페이지 화면들의 틀: 왼쪽 240px 메뉴(MyNav) + 제목 + 본문. 좁으면 메뉴가 위로 쌓인다.
 * 설정 화면(계정·화면·탈퇴)은 디자인처럼 본문 폭을 720px로 줄인다(`narrow`).
 * 바탕(옅은 면)은 라우트 handle이 고른다(router.tsx).
 */
export function MyLayout({
  title,
  description,
  narrow,
  children,
}: {
  title: string
  description?: string
  narrow?: boolean
  children: React.ReactNode
}) {
  // RequireAuth 뒤라 user가 있다. 세션이 막 끊긴 순간만 비어 있을 수 있다.
  const { user } = useAuth()
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-12 lg:pt-4">
      <aside className="lg:sticky lg:top-6">{user ? <MyNav user={user} /> : null}</aside>

      <div className={cn('flex min-w-0 flex-col gap-6', narrow && 'max-w-[720px]')}>
        <div className="flex flex-col gap-1.5">
          <h1 className="page-title">{title}</h1>
          {description ? <p className="text-muted-foreground text-[15px]">{description}</p> : null}
        </div>
        {children}
      </div>
    </div>
  )
}
