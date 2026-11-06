import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

/*
 * Buttons are soft pills. One rule decides the colour:
 *   cta       bubblegum pink, ink text. The ONE most important action on a screen. Never two.
 *   default   galactic violet. The normal primary action (save, create, publish).
 *   secondary pale violet tint. A useful second action.
 *   outline   white with a hairline. Neutral actions, toolbars, "Cancel".
 *   ghost     no chrome until hover. Icon buttons, menus, inline actions.
 *   destructive / link as usual.
 */
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-semibold whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform,opacity] duration-150 ease-swift outline-none select-none focus-visible:ring-[3px] focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-press hover:bg-primary-hover focus-visible:ring-ring/40",
        cta: "bg-cta text-cta-foreground shadow-cta hover:bg-cta-hover focus-visible:ring-pink-400/45 [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg[data-icon=inline-end]]:translate-x-0.5",
        outline:
          "border-border-strong bg-card text-foreground shadow-xs hover:border-violet-200 hover:bg-accent hover:text-accent-foreground aria-expanded:bg-accent aria-expanded:text-accent-foreground dark:border-white/12 dark:bg-white/[0.03] dark:hover:border-white/20 dark:hover:bg-white/[0.07] dark:hover:text-foreground",
        secondary:
          "bg-accent text-accent-foreground hover:bg-accent-strong aria-expanded:bg-accent-strong",
        ghost:
          "text-foreground/80 hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-white/[0.06]",
        destructive:
          "bg-destructive-soft text-destructive hover:bg-destructive/15 focus-visible:ring-destructive/25 dark:hover:bg-destructive/25",
        link: "rounded-md text-link underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-10 gap-2 px-[18px] has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-7 gap-1 px-2.5 text-xs has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3.5 text-[13px] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-12 gap-2 px-6 text-[15px] has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        xl: "h-14 gap-2.5 px-8 text-base has-data-[icon=inline-end]:pr-7 has-data-[icon=inline-start]:pl-7 [&_svg:not([class*='size-'])]:size-[18px]",
        icon: "size-10",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
