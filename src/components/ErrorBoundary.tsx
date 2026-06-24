import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Top-level error boundary. A render/runtime error anywhere in the tree would
 * otherwise unmount the whole app and leave a blank page — costly in an editor
 * where the user may have unsaved work. This catches it and offers a reload,
 * keeping the failure contained and visible instead of silent.
 *
 * Deliberately self-contained: it imports nothing from the app beyond React, so
 * the fallback can render even if app modules are what failed.
 */
type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Editor crashed:", error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 p-6 text-slate-200">
        <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl">
          <h1 className="text-lg font-semibold text-slate-100">
            Something went wrong
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            The editor hit an unexpected error and couldn't continue. Reloading
            usually fixes it; your locally saved maps are kept in this browser.
          </p>
          {error.message && (
            <pre className="mt-4 max-h-32 overflow-auto rounded bg-slate-950 p-3 text-xs text-rose-300">
              {error.message}
            </pre>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500"
          >
            Reload editor
          </button>
        </div>
      </div>
    );
  }
}
