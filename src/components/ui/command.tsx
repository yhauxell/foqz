import { Command as CommandPrimitive } from "cmdk";
import * as React from "react";

import { cn } from "@/lib/utils";

const CommandDialog = ({
  className,
  overlayClassName,
  contentClassName,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Dialog>) => (
  <CommandPrimitive.Dialog
    overlayClassName={cn(
      "fixed inset-0 z-[var(--z-focus-modal)] bg-black/20 backdrop-blur-[2px]",
      overlayClassName,
    )}
    contentClassName={cn(
      "glass-panel text-card-foreground fixed top-[12vh] left-1/2 z-[calc(var(--z-focus-modal)+1)] flex h-auto max-h-[min(420px,72vh)] w-[min(420px,92vw)] -translate-x-1/2 flex-col overflow-hidden rounded-[1.25rem] p-0",
      /* Crisp edge + depth (glass-panel already supplies main shadow) */
      "ring-1 ring-black/[0.07] dark:ring-white/[0.09]",
      /* cmdk layout */
      "[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-2 [&_[cmdk-group-heading]]:pt-1 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.12em] [&_[cmdk-group-heading]]:text-muted-foreground",
      "[&_[cmdk-group]]:px-0 [&_[cmdk-group]]:py-0",
      "[&_[cmdk-input-wrapper]_svg]:size-4 [&_[cmdk-input-wrapper]_svg]:opacity-50",
      "[&_[cmdk-input]]:h-9 [&_[cmdk-input]]:min-h-0 [&_[cmdk-input]]:border-0 [&_[cmdk-input]]:bg-transparent [&_[cmdk-input]]:text-[13px] [&_[cmdk-input]]:leading-snug [&_[cmdk-input]]:outline-none [&_[cmdk-input]]:placeholder:text-muted-foreground/90",
      "[&_[cmdk-item]_svg]:pointer-events-none [&_[cmdk-item]_svg]:size-[18px] [&_[cmdk-item]_svg]:shrink-0 [&_[cmdk-item]_svg]:opacity-80",
      className,
      contentClassName,
    )}
    {...props}
  >
    {children}
  </CommandPrimitive.Dialog>
);

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Input
    ref={ref}
    className={cn(
      "placeholder:text-muted-foreground/85 flex h-9 w-full rounded-lg border-0 bg-transparent px-0 py-1 text-[13px] leading-snug outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));
CommandInput.displayName = "CommandInput";

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List
    ref={ref}
    className={cn(
      "focus-command-list-wrap max-h-[min(280px,50vh)] overflow-x-hidden overflow-y-auto",
      className,
    )}
    {...props}
  />
));
CommandList.displayName = "CommandList";

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>((props, ref) => (
  <CommandPrimitive.Empty
    ref={ref}
    className="text-muted-foreground py-6 text-center text-sm"
    {...props}
  />
));
CommandEmpty.displayName = "CommandEmpty";

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group
    ref={ref}
    className={cn("text-foreground overflow-hidden", className)}
    {...props}
  />
));
CommandGroup.displayName = "CommandGroup";

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium leading-snug outline-none select-none transition-[background,box-shadow] duration-100 data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50",
      "text-foreground/95 data-[selected=true]:bg-black/[0.06] data-[selected=true]:text-foreground data-[selected=true]:shadow-[inset_0_1px_0_rgb(255_255_255/0.55)]",
      "dark:data-[selected=true]:bg-white/[0.09] dark:data-[selected=true]:shadow-[inset_0_1px_0_rgb(255_255_255/0.08)]",
      className,
    )}
    {...props}
  />
));
CommandItem.displayName = "CommandItem";

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator
    ref={ref}
    className={cn("bg-border -mx-1 h-px", className)}
    {...props}
  />
));
CommandSeparator.displayName = "CommandSeparator";

export {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
};
