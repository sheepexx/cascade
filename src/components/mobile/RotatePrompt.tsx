import { useT } from "../../lib/i18n";
import { Button } from "../ui/Controls";

/**
 * Asks for the phone to be turned sideways before a playtest goes on. The run
 * waits paused behind it and carries on, after the countdown, once it is.
 */
export function RotatePrompt({ onPlayUpright, onBack }: { onPlayUpright: () => void; onBack: () => void }) {
  const t = useT();
  return <div role="dialog" aria-modal="true" aria-labelledby="rotate-prompt-title" className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-ink-900/95 px-8 text-center backdrop-blur-sm">
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-20 w-20 text-slate-200" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <g className="rotate-hint">
        <rect x="22" y="10" width="20" height="36" rx="4" />
        <path d="M29 41h6" />
      </g>
      <path d="M50 26a20 20 0 0 1-8 22" className="text-accent" stroke="currentColor" />
      <path d="m40 44 2 4.5 4.5-1.5" className="text-accent" stroke="currentColor" />
    </svg>
    <div className="max-w-xs">
      <h2 id="rotate-prompt-title" className="text-lg font-semibold text-slate-50">{t("mobile.rotateTitle")}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">{t("mobile.rotateBody")}</p>
    </div>
    <div className="flex w-full max-w-xs flex-col gap-2">
      <Button variant="primary" onClick={onPlayUpright}>{t("mobile.rotatePlayUpright")}</Button>
      <Button onClick={onBack}>{t("common.back")}</Button>
    </div>
  </div>;
}
