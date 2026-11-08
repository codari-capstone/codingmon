import { cn } from 'cn'

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // 밑줄 하나. 밑줄 색(--input)이 입력칸 경계 3:1을 맡는다.
        // 포커스하면 밑줄이 포인트 색이 되고 아래로 1px 두꺼워져, 색 차이만으로 알리지 않는다.
        'border-input placeholder:text-muted-foreground focus-visible:border-primary aria-invalid:border-destructive flex h-11 w-full min-w-0 rounded-none border-0 border-b-2 bg-transparent px-0 text-sm transition-[border-color,box-shadow] outline-none focus-visible:shadow-[0_1px_0_var(--primary)] disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
