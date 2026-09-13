import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactNode } from 'react';
import { cn } from './cn';

export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  readonly content: ReactNode;
  readonly children: ReactNode;
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  readonly className?: string;
}

export function Tooltip({ content, children, side = 'bottom', className }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 max-w-xs rounded-md border border-border bg-surface px-2 py-1 text-xs text-foreground shadow-md',
            className,
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-surface" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
