import { Button } from '@flowscope/ui';
import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ErrorBoundaryState {
  readonly error: Error | null;
}

/**
 * The app-level error boundary (MASTER_PLAN.md §62): an unhandled render
 * error shows a recoverable screen instead of a blank window or crash.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[flowscope:renderer] unhandled error', error, info.componentStack);
  }

  private readonly handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-8 text-center text-foreground">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="max-w-sm text-xs text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" onClick={this.handleReload}>
          Reload FlowScope
        </Button>
      </div>
    );
  }
}
