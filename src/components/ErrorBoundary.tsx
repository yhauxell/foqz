import React, { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  public reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="fixed bottom-4 right-4 z-[9999] p-4 max-w-sm rounded-xl border border-rose-500/40 bg-zinc-950/90 text-rose-200 text-xs shadow-2xl backdrop-blur-md flex flex-col gap-2 animate-in fade-in">
          <div className="font-semibold text-rose-400">Recovered from unexpected error</div>
          <div className="font-mono text-[10px] text-zinc-400 truncate">
            {this.state.error?.message || "Unknown error"}
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="self-start px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-medium text-xs transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
