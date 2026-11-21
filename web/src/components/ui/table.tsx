import { cn } from '@/lib/utils'

/**
 * 표는 줄바꿈이 되지 않으므로 좁은 화면에서는 가로 스크롤이 정답이다.
 * 스크롤을 표 바깥 컨테이너가 받게 두어 문서 자체가 가로로 넘치지 않게 한다.
 */
function Table({ className, ...props }: React.ComponentProps<'table'>) {
  return (
    <div data-slot="table-container" className="scroll-fade-x w-full overflow-x-auto">
      <table
        data-slot="table"
        className={cn('w-full caption-bottom border-collapse text-sm', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
  return <thead data-slot="table-header" className={cn(className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return <tbody data-slot="table-body" className={cn(className)} {...props} />
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      // 줄 사이는 칸 아래 선으로 나눈다(학습자 문제 목록의 data-table과 같다). 올리면 옅은 면으로 어느 줄인지 보여 준다
      className={cn('group hover:bg-muted transition-colors', className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'text-muted-foreground h-10 border-b px-3 text-left align-middle text-xs font-medium whitespace-nowrap',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('border-b px-3 py-3 align-middle group-last:border-b-0', className)}
      {...props}
    />
  )
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell }
