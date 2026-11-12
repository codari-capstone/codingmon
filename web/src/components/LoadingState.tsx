import { Mascot } from '@/components/ui/mascot'

interface LoadingStateProps {
  /** 기본 "불러오는 중…" */
  label?: string
  mascotSize?: number
}

/**
 * 달리는 펭귄과 흐르는 막대로 화면 전체나 큰 영역이 불러오는 중임을 알린다.
 * 1초 넘게 걸리는 첫 화면·목록·리포트에 쓰고, 표 몇 줄이나 버튼 안처럼 작은 곳에는 쓰지 않는다
 * (그런 곳은 Skeleton). 한 화면에 둘 이상 두지 않는다. 얼마나 남았는지 아는 작업(업로드 등)은
 * 이것 대신 Progress로 진행률을 보인다 — Progress가 쓰지 말라는 것은 진행률을 모르는 기다림이다.
 * 움직임 줄이기에서는 막대가 멈춘다.
 */
export function LoadingState({ label = '불러오는 중…', mascotSize = 112 }: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center gap-3 px-6 py-8">
      <Mascot pose="loading" size={mascotSize} />
      <div className="bg-muted dark:bg-background relative h-2.5 w-[168px] overflow-hidden rounded-full">
        <div className="bg-primary absolute inset-y-0 w-[45%] animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-[inherit] motion-reduce:left-0 motion-reduce:w-3/5 motion-reduce:animate-none" />
      </div>
      <p className="text-muted-foreground m-0 text-sm font-semibold">{label}</p>
    </div>
  )
}
