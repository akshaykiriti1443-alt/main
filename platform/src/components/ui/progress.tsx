"use client"

import * as React from "react"
import { cn } from "cn"
import { Progress as ProgressPrimitive } from "radix-ui"

/* Progress is violet (the path forward). Recolour the bar from the root with
   *:data-[slot=progress-indicator]:bg-success when it means "done". */
function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-2 w-full items-center overflow-x-hidden rounded-full bg-muted ring-1 ring-ink/[0.04] ring-inset dark:ring-white/[0.05]",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 rounded-full bg-primary shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-transform duration-500 ease-soft"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
