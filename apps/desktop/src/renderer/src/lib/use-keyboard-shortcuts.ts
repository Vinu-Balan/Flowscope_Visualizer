import { useEffect } from 'react';

export interface KeyboardShortcut {
  /** KeyboardEvent.key value, e.g. 'k', 'o', ',', 'Escape'. Case-insensitive. */
  readonly key: string;
  /** Ctrl on Windows/Linux, Cmd on macOS. */
  readonly mod?: boolean;
  readonly shift?: boolean;
  readonly handler: (event: KeyboardEvent) => void;
  /** Defaults to true; set false for keys (like Escape) that should still propagate. */
  readonly preventDefault?: boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** navigator.platform is deprecated; userAgent sniffing is the stable fallback in Electron's Chromium. */
function isMacPlatform(): boolean {
  return navigator.userAgent.toLowerCase().includes('mac');
}

/**
 * The single global keyboard-shortcut dispatcher for the renderer
 * (MASTER_PLAN.md §67-68: shortcuts route through one extensible command
 * system, never scattered listeners). Shortcuts are skipped while typing in
 * an editable element, except Escape.
 */
export function useKeyboardShortcuts(shortcuts: readonly KeyboardShortcut[]): void {
  useEffect(() => {
    const isMac = isMacPlatform();

    function handleKeyDown(event: KeyboardEvent): void {
      if (isEditableTarget(event.target) && event.key !== 'Escape') {
        return;
      }

      const modPressed = isMac ? event.metaKey : event.ctrlKey;

      for (const shortcut of shortcuts) {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
        const modMatches = Boolean(shortcut.mod) === modPressed;
        const shiftMatches = Boolean(shortcut.shift) === event.shiftKey;

        if (keyMatches && modMatches && shiftMatches) {
          if (shortcut.preventDefault !== false) {
            event.preventDefault();
          }
          shortcut.handler(event);
          return;
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shortcuts]);
}
