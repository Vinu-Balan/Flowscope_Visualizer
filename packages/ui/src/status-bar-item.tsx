import type { ReactNode } from 'react';
import { cn } from './cn';

export interface StatusBarItemProps {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly className?: string;
  readonly onClick?: () => void;
}

export function StatusBarItem({ icon, label, className, onClick }: StatusBarItemProps) {
  const interactive = onClick !== undefined;

  return (
    <div
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        'flex items-center gap-1.5 px-2 text-[11px] text-muted-foreground',
        interactive && 'cursor-pointer transition-colors hover:text-foreground',
        className,
      )}
    >
      {icon && <span className="[&>svg]:h-3 [&>svg]:w-3">{icon}</span>}
      {label}
    </div>
  );
}
