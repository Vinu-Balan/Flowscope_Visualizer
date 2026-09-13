import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  readonly icon?: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly action?: ReactNode;
  readonly className?: string;
}

/** The standard empty/idle/error placeholder — see MASTER_PLAN.md §62-64: never an unexplained blank screen. */
export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-3 p-8 text-center',
        className,
      )}
    >
      {icon && <div className="text-muted-foreground [&>svg]:h-8 [&>svg]:w-8">{icon}</div>}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
