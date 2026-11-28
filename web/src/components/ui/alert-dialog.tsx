import * as React from 'react'
import { cn } from '@/lib/utils'
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui'

import { Button } from '@/components/ui/button'
import {
  MODAL_DESC,
  MODAL_FOOTER,
  MODAL_MEDIA,
  MODAL_OVERLAY,
  MODAL_PANEL,
  MODAL_SIZE,
  MODAL_TITLE,
} from '@/components/ui/dialog'

// 되돌릴 수 없는 동작의 확인 창. 모양은 디자인 시스템 Modal과 같고(dialog.tsx), 바깥을 눌러도 닫히지 않는다

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

function AlertDialogTrigger({
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

function AlertDialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
  return (
    <AlertDialogPrimitive.Overlay
      data-slot="alert-dialog-overlay"
      className={cn(MODAL_OVERLAY, className)}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  size = 'md',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content> & {
  size?: keyof typeof MODAL_SIZE
}) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        data-size={size}
        // 자식(Header·본문·Footer) 사이를 16px씩 띄운다. 회원 탈퇴 창처럼 Header와 Footer 사이에 입력 묶음이 오는
        // 창이 있어, 간격이 없으면 그 묶음이 설명문에 붙는다(#258 리뷰)
        className={cn(MODAL_PANEL, MODAL_SIZE[size], 'flex flex-col gap-4', className)}
        {...props}
      />
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div data-slot="alert-dialog-header" className={cn('flex flex-col', className)} {...props} />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="alert-dialog-footer" // gap-4(16px)에 mt-2를 더해 Footer 위는 Modal과 같은 24px
      className={cn(MODAL_FOOTER, 'mt-2', className)}
      {...props}
    />
  )
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-dialog-media" className={cn(MODAL_MEDIA, className)} {...props} />
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn(MODAL_TITLE, className)}
      {...props}
    />
  )
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn(MODAL_DESC, className)}
      {...props}
    />
  )
}

function AlertDialogAction({
  className,
  variant = 'primary',
  size = 'md',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Action
        data-slot="alert-dialog-action"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

function AlertDialogCancel({
  className,
  variant = 'secondary',
  size = 'md',
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> &
  Pick<React.ComponentProps<typeof Button>, 'variant' | 'size'>) {
  return (
    <Button variant={variant} size={size} asChild>
      <AlertDialogPrimitive.Cancel
        data-slot="alert-dialog-cancel"
        className={cn(className)}
        {...props}
      />
    </Button>
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
