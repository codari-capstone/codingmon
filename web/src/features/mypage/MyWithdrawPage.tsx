import { useQuery } from '@tanstack/react-query'
import { Navigate } from 'react-router'

import scene from '@/assets/scenes/withdraw.png'
import { Alert } from '@/components/ui/alert'
import { Icon } from '@/components/ui/icon'
import { useAuth } from '@/features/auth/useAuth'
import { cn } from '@/lib/utils'
import { WithdrawSection } from './AccountSettings'
import { MY_CARD, MyLayout } from './MyLayout'
import { activityQuery } from './myPageQuery'

/** 명세 MY-04의 '계정과 제출 기록, 학습 통계, AI 분석, 리포트가 모두 삭제'를 항목으로 나눈 것 */
const LOSES = [
  '모든 제출 기록과 작성한 코드',
  'AI 분석 결과와 열어 본 힌트',
  '학습 리포트와 활동 기록',
  '닉네임과 계정 정보',
]

/** 남은 기록을 숫자로 짚는다. 불러오지 못했으면 숫자 없이 말한다 — 탈퇴를 막을 일은 아니다 */
function Farewell() {
  const { data } = useQuery(activityQuery())
  return (
    <section className={cn(MY_CARD, 'flex-row flex-wrap items-center gap-6')}>
      <img src={scene} alt="" width={160} height={126} className="block h-auto shrink-0" />
      <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
        <p className="text-foreground text-xl font-bold tracking-[-0.01em]">
          정말 떠나시는 건가요?
        </p>
        <p className="text-muted-foreground text-[15px] leading-[1.65]">
          {data
            ? `지금까지 맞힌 문제 ${data.solvedCount}개와 ${data.totalActiveDays}일 동안의 기록이 있어요. `
            : null}
          탈퇴하면 아래 내용이 모두 지워져요.
        </p>
      </div>
    </section>
  )
}

/** 회원 탈퇴 (MY-04). 관리자는 탈퇴할 수 없어(명세, 서버 403) 마이페이지로 돌려보낸다. */
export function Component() {
  const { user } = useAuth()
  if (user?.role === 'ADMIN') return <Navigate to="/me" replace />
  return (
    <MyLayout title="회원 탈퇴" narrow>
      <Farewell />
      <section aria-labelledby="loses-heading" className={cn(MY_CARD, 'gap-5')}>
        <h2 id="loses-heading" className="text-foreground text-lg font-semibold">
          지워지는 것
        </h2>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {LOSES.map((text) => (
            <li key={text} className="text-body-foreground flex items-center gap-3 text-[15px]">
              <span className="bg-destructive-soft text-destructive-text inline-flex size-7 shrink-0 items-center justify-center rounded-full">
                <Icon name="x" size={14} />
              </span>
              {text}
            </li>
          ))}
        </ul>
        <Alert tone="danger">
          탈퇴한 뒤에는 되돌릴 수 없어요. 같은 이메일로 다시 가입해도 기록은 복구되지 않아요.
        </Alert>
      </section>
      {user ? <WithdrawSection user={user} /> : null}
    </MyLayout>
  )
}
