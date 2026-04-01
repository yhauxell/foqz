import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "@/lib/utils"

type PopoverPositionerProps = React.ComponentProps<typeof PopoverPrimitive.Positioner>
type PopoverPopupProps = React.ComponentProps<typeof PopoverPrimitive.Popup>

export type PopoverContentProps = PopoverPopupProps &
  Pick<PopoverPositionerProps, "side" | "align" | "sideOffset">

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root modal={false} {...props} />
}

function PopoverTrigger(props: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger {...props} />
}

function PopoverContent({
  className,
  align = "center",
  side = "bottom",
  sideOffset = 4,
  children,
  ...popupProps
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        className="isolate z-[10050] outline-none"
        side={side}
        align={align}
        sideOffset={sideOffset}
      >
        <PopoverPrimitive.Popup
          className={cn(
            "max-h-[min(var(--available-height),320px)] w-auto max-w-[min(calc(100vw-24px),320px)] origin-[var(--transform-origin)] rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none",
            "data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0 data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0",
            className
          )}
          initialFocus={false}
          {...popupProps}
        >
          {children}
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
