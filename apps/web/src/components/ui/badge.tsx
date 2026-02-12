import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2.5 py-1 text-xs font-bold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-[#171717] text-white hover:bg-[#171717]/90",
        brand: "bg-[#009588] text-white hover:bg-[#009588]/90",
        secondary:
          "bg-[#E0F2F1] text-[#009588] hover:bg-[#E0F2F1]/80",
        destructive:
          "bg-orange-50 text-orange-600 hover:bg-orange-100",
        outline:
          "border-neutral-200 text-neutral-600 hover:bg-neutral-50",
        ghost: "hover:bg-neutral-100 hover:text-neutral-900",
        link: "text-[#009588] underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
