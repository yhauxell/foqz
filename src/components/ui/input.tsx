import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "flex w-full min-w-0 border border-input bg-background text-foreground shadow-xs outline-none transition-[color,box-shadow,border-color] selection:bg-primary/15 placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40 [&[readonly]]:cursor-default",
  {
    variants: {
      variant: {
        default: "rounded-md border-input",
        glass:
          "rounded-[min(var(--radius-xl),14px)] border-white/45 bg-white/50 backdrop-blur-md shadow-[inset_0_1px_0_rgb(255_255_255/55%)] dark:border-white/12 dark:bg-black/25",
        quick:
          "rounded-none border-0 bg-transparent shadow-none ring-offset-0 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-0 dark:bg-transparent",
      },
      inputSize: {
        default: "h-9 px-3 py-2 text-sm",
        sm: "h-8 rounded-[min(var(--radius-md),12px)] px-2.5 py-1.5 text-[0.8125rem]",
        quick: "h-7 px-3 py-1.5 text-[0.8125rem] leading-tight",
      },
    },
    defaultVariants: {
      variant: "default",
      inputSize: "default",
    },
  }
)

export type InputProps = Omit<InputPrimitive.Props, "size"> &
  VariantProps<typeof inputVariants>

function Input({ className, variant = "default", inputSize = "default", ...props }: InputProps) {
  return (
    <InputPrimitive
      data-slot="input"
      className={cn(inputVariants({ variant, inputSize, className }))}
      {...props}
    />
  )
}

export { Input, inputVariants }
