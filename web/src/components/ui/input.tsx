import { cn } from 'cn'

/**
 * 밑줄 하나. 밑줄 색(--input)이 입력칸 경계 3:1을 맡는다.
 * 포커스하면 밑줄이 2px에서 4px로 두꺼워진다. 밑줄 색 변화(회색→포인트)는 명도 차가 1.1:1뿐이라
 * 포커스를 알리는 것은 새로 칠해지는 2px 띠다. 이 띠는 바탕·카드·옅은 면과 3:1 이상이다.
 * 띠 색은 --primary가 아니라 포커스 색 --ring이다 — 다크 모드에서 --primary는 옅은 면 위 2.87:1이다(#250 리뷰).
 * 오류 상태에서는 밑줄과 띠를 모두 위험색으로 둬, 두 색 밑줄이 겹치지 않게 한다.
 *
 * @/components/ui에 select·textarea가 없어 네이티브를 쓰는 곳(관리자 폼)도 이 값을 쓴다.
 */
export const UNDERLINE_FIELD =
  'border-input placeholder:text-muted-foreground focus-visible:border-ring aria-invalid:border-destructive w-full min-w-0 rounded-none border-0 border-b-2 bg-transparent px-0 text-sm transition-[border-color,box-shadow] outline-none focus-visible:shadow-[0_2px_0_var(--ring)] aria-invalid:focus-visible:shadow-[0_2px_0_var(--destructive)] disabled:opacity-50'

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(UNDERLINE_FIELD, 'flex h-11', className)}
      {...props}
    />
  )
}

export { Input }
