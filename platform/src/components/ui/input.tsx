import * as React from "react"
import { cn } from "cn"

/* Inputs: 40px tall, 12px corners, a hairline that warms to violet on hover and focus.
   The focus ring is a soft violet halo, never a hard outline. */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3.5 py-1 text-base shadow-xs transition-[color,box-shadow,border-color] duration-150 ease-swift outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-subtle-foreground hover:border-border-strong focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/15 md:text-sm dark:bg-white/[0.03] dark:hover:border-white/20 dark:disabled:bg-white/[0.02] dark:aria-invalid:border-destructive/60 dark:aria-invalid:ring-destructive/30",
        className
      )}
      {...props}
    />
  )
}

export { Input }
