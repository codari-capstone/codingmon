import { Search } from 'lucide-react'
import { cn } from 'cn'

/**
 * 목록을 찾는 알약 검색칸. 폼의 일반 입력에는 Input을 쓴다. 한 화면에 둘을 두지 않는다.
 * shortcut은 키캡으로 보이기만 한다 — 단축키 동작은 쓰는 쪽이 붙인다.
 * 라벨이 없으니 aria-label을 준다(placeholder는 라벨이 아니다).
 */
function SearchInput({
  className,
  shortcut,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type'> & { shortcut?: string }) {
  return (
    <div
      data-slot="search-input"
      className={cn(
        'flex h-control-md w-full items-center gap-2.5 rounded-full bg-muted pr-3 pl-[18px] text-muted-foreground transition-[box-shadow,background-color] focus-within:bg-card focus-within:shadow-[inset_0_0_0_1.5px_var(--ring),var(--shadow-focus)]',
        className,
      )}
    >
      <Search aria-hidden className="size-[18px] shrink-0" />
      <input
        type="search"
        className="min-w-0 flex-1 border-0 bg-transparent text-[15px] font-medium text-foreground outline-none placeholder:font-normal placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:appearance-none"
        {...props}
      />
      {shortcut ? (
        <kbd className="rounded-sm bg-card px-1.5 py-0.5 font-sans text-xs font-semibold text-muted-foreground shadow-key">
          {shortcut}
        </kbd>
      ) : null}
    </div>
  )
}

export { SearchInput }
