import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border bg-clip-padding text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-black/12 bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.26),0_1px_2px_rgb(0_0_0/0.16),0_4px_14px_rgb(0_0_0/0.1)] hover:bg-primary/90 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.34),0_2px_4px_rgb(0_0_0/0.12),0_6px_18px_rgb(0_0_0/0.1)] active:shadow-[inset_0_2px_5px_rgb(0_0_0/0.22),inset_0_1px_0_rgb(255_255_255/0.14)] dark:border-white/14 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.48),0_1px_2px_rgb(0_0_0/0.28),0_4px_18px_rgb(0_0_0/0.32)] dark:hover:bg-primary/92 dark:hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.58),0_2px_6px_rgb(0_0_0/0.32),0_6px_22px_rgb(0_0_0/0.28)] dark:active:shadow-[inset_0_2px_6px_rgb(0_0_0/0.2),inset_0_1px_0_rgb(255_255_255/0.35)]",
        outline:
          "border-border/95 bg-background/90 text-foreground backdrop-blur-md shadow-[inset_0_1px_0_rgb(255_255_255/0.52),0_1px_2px_rgb(0_0_0/0.05),0_4px_16px_rgb(0_0_0/0.06)] hover:border-border hover:bg-muted/95 hover:text-foreground hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.62),0_2px_6px_rgb(0_0_0/0.07),0_6px_20px_rgb(0_0_0/0.07)] aria-expanded:border-border aria-expanded:bg-muted aria-expanded:text-foreground aria-expanded:shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_1px_3px_rgb(0_0_0/0.06)] dark:border-white/14 dark:bg-input/35 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_4px_22px_rgb(0_0_0/0.38)] dark:hover:border-white/18 dark:hover:bg-input/52 dark:hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_6px_26px_rgb(0_0_0/0.42)] dark:aria-expanded:bg-input/48",
        secondary:
          "border-black/10 bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.68),0_1px_2px_rgb(0_0_0/0.06),0_3px_12px_rgb(0_0_0/0.05)] hover:bg-secondary/86 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.78),0_2px_4px_rgb(0_0_0/0.07),0_5px_16px_rgb(0_0_0/0.06)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground aria-expanded:shadow-[inset_0_1px_0_rgb(255_255_255/0.65),0_1px_2px_rgb(0_0_0/0.06)] dark:border-white/12 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_4px_18px_rgb(0_0_0/0.35)] dark:hover:bg-secondary/88 dark:hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_6px_22px_rgb(0_0_0/0.4)]",
        ghost:
          "border-transparent shadow-none hover:border-black/6 hover:bg-muted/92 hover:text-foreground hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.42),0_1px_3px_rgb(0_0_0/0.05)] aria-expanded:border-black/6 aria-expanded:bg-muted aria-expanded:text-foreground aria-expanded:shadow-[inset_0_1px_0_rgb(255_255_255/0.38),0_1px_2px_rgb(0_0_0/0.04)] dark:hover:border-white/10 dark:hover:bg-muted/55 dark:hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.1),0_2px_10px_rgb(0_0_0/0.28)] dark:aria-expanded:border-white/10",
        destructive:
          "border-red-600/18 bg-destructive/12 text-destructive shadow-[inset_0_1px_0_rgb(255_255_255/0.38),0_1px_2px_rgb(220_38_38/0.14),0_3px_12px_rgb(220_38_38/0.1)] hover:border-red-600/28 hover:bg-destructive/20 hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.48),0_2px_6px_rgb(220_38_38/0.18)] focus-visible:border-destructive/45 focus-visible:ring-destructive/22 dark:border-red-400/22 dark:bg-destructive/24 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.12),0_4px_18px_rgb(0_0_0/0.42)] dark:hover:border-red-400/32 dark:hover:bg-destructive/34 dark:hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.16),0_6px_22px_rgb(0_0_0/0.48)] dark:focus-visible:ring-destructive/38",
        link: "border-transparent bg-transparent text-primary shadow-none underline-offset-4 hover:bg-transparent hover:underline hover:shadow-none dark:hover:bg-transparent",
      },
      size: {
        default:
          "h-9 gap-2 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5",
        xs: "h-7 gap-1.5 rounded-[min(var(--radius-md),10px)] px-2.5 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-[min(var(--radius-md),12px)] px-3.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        icon: "size-9",
        "icon-xs":
          "size-7 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-8 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
