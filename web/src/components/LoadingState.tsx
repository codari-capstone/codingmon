import running from '@/assets/scenes/loading.png'
import { cn } from '@/lib/utils'

type LoadingStateProps =
  | {
      /** 기본 "불러오는 중…" */
      label?: string
      inPanel?: false
    }
  | {
      /**
       * 패널 안에서 기다릴 때(AI 분석·리뷰). 작게 그리고 글자·live region을 두지 않는다.
       * 무엇을 기다리는지는 패널의 status 문구가 읽는다. 여기서도 읽으면 두 번 들린다.
       * 그래서 label을 받지 않는다. 넘겨도 보이지도 읽히지도 않는다
       */
      inPanel: true
      label?: never
    }

/**
 * 달리는 펭귄과 흐르는 막대로 화면 전체가 불러오는 중임을 알린다(#327).
 * 화면에 아직 아무것도 없는 첫 로딩(세션 확인, 문제 풀이·제출 결과·리포트 등)에 쓰고, 화면 틀은 보이고
 * 표나 카드 안만 기다리는 곳에는 쓰지 않는다(그런 곳은 ListSkeleton). 한 화면에 둘 이상 두지 않는다.
 * 예외로 AI 분석·리뷰는 몇 초씩 걸려 패널 안에서 `inPanel`로 쓴다.
 * 얼마나 남았는지 아는 작업(업로드 등)은 이것 대신 Progress로 진행률을 보인다.
 *
 * 곧 끝나는 로딩에서 펭귄이 번쩍이지 않게 잠깐 뒤에 서서히 나타난다. 움직임 줄이기에서는 펭귄과 막대가 멈춘다.
 */
export function LoadingState({ label = '불러오는 중…', inPanel = false }: LoadingStateProps) {
  return (
    <div
      // e2e가 불러오기가 끝났는지 이 표식으로 본다(layout.spec)
      data-slot="loading-state"
      {...(inPanel ? { 'aria-hidden': true } : { role: 'status', 'aria-live': 'polite' })}
      className={cn(
        'flex animate-[loading-appear_0.6s_ease-out_both] flex-col items-center gap-4',
        inPanel ? 'py-4' : 'px-6 py-12',
      )}
    >
      {/* 장식이다. 무엇을 하는지는 아래 글자가, inPanel이면 패널의 status 문구가 알린다(여기에 다시 두면 두 번 읽힌다).
          558×418 원본이라 2배 화면에서도 선명하다 */}
      <img
        src={running}
        alt=""
        width={inPanel ? 150 : 220}
        height={inPanel ? 112 : 165}
        className="block h-auto max-w-full animate-[loading-bob_0.9s_ease-in-out_infinite] motion-reduce:animate-none"
      />
      <div className="bg-border dark:bg-background relative h-2.5 w-[168px] overflow-hidden rounded-full">
        <div className="bg-primary absolute inset-y-0 w-[45%] animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-[inherit] motion-reduce:left-0 motion-reduce:w-3/5 motion-reduce:animate-none" />
      </div>
      {inPanel ? null : <p className="text-muted-foreground m-0 text-sm font-semibold">{label}</p>}
    </div>
  )
}
