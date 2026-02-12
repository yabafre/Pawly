import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: "bg-[#171717] text-white hover:bg-[#171717]/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90",
        outline:
          "border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 hover:text-neutral-900",
        secondary:
          "bg-[#E0F2F1] text-[#009588] hover:bg-[#E0F2F1]/80",
        ghost:
          "hover:bg-neutral-100 hover:text-neutral-900",
        link: "text-[#009588] underline-offset-4 hover:underline",
        brand: "bg-[#009588] text-white hover:bg-[#009588]/90",
      },
      size: {
        default: "h-11 px-6 py-2 has-[>svg]:px-4",
        xs: "h-8 rounded-lg px-3 text-xs has-[>svg]:px-2",
        sm: "h-9 rounded-lg px-4 has-[>svg]:px-3",
        lg: "h-12 rounded-2xl px-8 has-[>svg]:px-6 text-base",
        icon: "size-11",
        "icon-xs": "size-8 rounded-lg",
        "icon-sm": "size-9 rounded-lg",
        "icon-lg": "size-12 rounded-2xl",
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
  const Comp = asChild ? Slot : "button"

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
