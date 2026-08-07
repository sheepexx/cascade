import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "../lib/i18n/core";

type Props = { children: ReactNode };
type State = { error: Error | null; stack: string | null; copied: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ stack: info.componentStack ?? null });
    console.error("Editor crashed:", error, info.componentStack);
  }

  copyDetails = (): void => {
    const { error, stack } = this.state;
    const details = [
      `Cascade ${__APP_VERSION__}`,
      navigator.userAgent,
      error?.stack ?? error?.message ?? "unknown error",
      stack ?? "",
    ].join("\n\n");
    void navigator.clipboard
      ?.writeText(details)
      .then(() => this.setState({ copied: true }))
      .catch(() => {});
  };

  render(): ReactNode {
    const { error, copied } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-ink-900 p-6 text-slate-200">
        <div className="w-full max-w-md rounded-2xl border border-white/10 bg-ink-800 p-6 shadow-[0_28px_90px_rgba(0,0,0,0.56)]">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}favicon.png?v=3`}
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-lg"
            />
            <h1 className="text-base font-semibold text-slate-100">
              {t("crash.title")}
            </h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            {t("crash.body")}
          </p>
          {error.message && (
            <pre className="mt-4 max-h-32 overflow-auto rounded-lg border border-white/5 bg-ink-900 p-3 text-xs text-accent-soft">
              {error.message}
            </pre>
          )}
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 rounded-lg border border-accent-deep/40 bg-accent/90 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-soft/95"
            >
              {t("crash.reload")}
            </button>
            <button
              type="button"
              onClick={this.copyDetails}
              className="rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 hover:text-slate-100"
            >
              {copied ? t("common.copied") : t("crash.copyDetails")}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
