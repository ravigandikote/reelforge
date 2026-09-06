import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-2.5 py-0.5 font-caption text-xs font-medium',
  {
    variants: {
      variant: {
        default: 'bg-indigo text-cream',
        ok: 'bg-emerald-600/15 text-emerald-800',
        warn: 'bg-amber-500/20 text-amber-900',
        error: 'bg-red-600/15 text-red-800',
        muted: 'bg-indigo/10 text-indigo/70',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}
