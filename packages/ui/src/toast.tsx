import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { create } from 'zustand';
import { cn } from './cn';

export type ToastVariant = 'info' | 'success' | 'error';

export interface ToastRecord {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly variant: ToastVariant;
}

export interface PushToastInput {
  readonly title: string;
  readonly description?: string;
  readonly variant?: ToastVariant;
  /** Milliseconds before auto-dismiss. Defaults to 5000. */
  readonly duration?: number;
}

interface ToastState {
  readonly toasts: readonly ToastRecord[];
  push(this: void, toast: PushToastInput): string;
  dismiss(this: void, id: string): void;
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push(input) {
    const id = globalThis.crypto.randomUUID();
    const record: ToastRecord = {
      id,
      title: input.title,
      variant: input.variant ?? 'info',
      ...(input.description !== undefined ? { description: input.description } : {}),
    };
    set((state) => ({ toasts: [...state.toasts, record] }));
    setTimeout(() => {
      get().dismiss(id);
    }, input.duration ?? 5000);
    return id;
  },
  dismiss(id) {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
}));

/** Fire-and-forget toast helper — usable from anywhere, no provider required. */
export function toast(input: PushToastInput): string {
  return useToastStore.getState().push(input);
}

const VARIANT_ICON = { info: Info, success: CheckCircle2, error: AlertCircle } as const;

const VARIANT_BORDER: Record<ToastVariant, string> = {
  info: 'border-border',
  success: 'border-emerald-600/40',
  error: 'border-destructive/50',
};

/** Mount once near the root of the app. Renders whatever `toast()` has pushed. */
export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const dismiss = useToastStore((state) => state.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-10 right-3 z-[100] flex w-80 flex-col gap-2">
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const Icon = VARIANT_ICON[t.variant];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              role="status"
              className={cn(
                'pointer-events-auto flex items-start gap-2 rounded-md border bg-surface p-3 shadow-lg',
                VARIANT_BORDER[t.variant],
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-foreground">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                }}
                className="text-muted-foreground transition-colors hover:text-foreground"
                aria-label="Dismiss notification"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
