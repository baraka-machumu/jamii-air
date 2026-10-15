// shadcn/ui Tooltip (new-york) on Radix. Used for the collapsed sidebar's labels, never as the
// only way to read a value: a tooltip is unreachable by touch and by many screen readers.
import * as Primitive from '@radix-ui/react-tooltip';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export const TooltipProvider = Primitive.Provider;
export const Tooltip = Primitive.Root;
export const TooltipTrigger = Primitive.Trigger;

export function TooltipContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof Primitive.Content>) {
  return (
    <Primitive.Portal>
      <Primitive.Content
        sideOffset={sideOffset}
        className={cn('z-50 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-raised', className)}
        {...props}
      />
    </Primitive.Portal>
  );
}
