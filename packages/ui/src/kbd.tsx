import { cn } from './cn';

export interface KbdProps {
  readonly keys: readonly string[];
  readonly className?: string;
}

/** Renders a keyboard shortcut as a row of small key caps, e.g. <Kbd keys={['Ctrl', 'K']} />. */
export function Kbd({ keys, className }: KbdProps) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {keys.map((key, index) => (
        <kbd
          key={`${key}-${String(index)}`}
          className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
