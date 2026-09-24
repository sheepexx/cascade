import type { CSSProperties } from "react";
import type { useGhostNotes } from "../hooks/useGhostNotes";
import { Slider } from "./ui/Controls";
import { useT } from "../lib/i18n";

// The panel is ink-900, so slider thumbs ring in that colour.
const PANEL_SURFACE = { "--slider-surface": "#0f0f14" } as CSSProperties;

export function GhostNotesPanel({ review, focusEditor, hasAudio }: {
  review: ReturnType<typeof useGhostNotes>; focusEditor: () => void; hasAudio: boolean;
}) {
  const t = useT();
  const act = (fn: () => void) => () => { fn(); focusEditor(); };
  const button = "flex-1 rounded-md border border-white/10 px-2 py-1.5 hover:bg-white/10 disabled:opacity-40";
  const count = review.ghosts.length;
  const status = !hasAudio ? t("ghost.loadAudioFirst") : review.busy ? t("ghost.listening") : review.error || t("ghost.count", { count });
  return <aside aria-label={t("ghost.title")} className="absolute bottom-16 right-3 z-20 w-56 max-w-[calc(100%-1.5rem)] rounded-xl border border-teal-300/25 bg-ink-900/95 p-3 text-xs text-slate-300 shadow-xl backdrop-blur">
    <div className="flex items-center justify-between"><strong className="text-teal-200">{t("ghost.title")}</strong><button aria-label={t("ghost.hide")} onClick={act(() => review.setEnabled(false))}>×</button></div>
    <p role="status" className="mt-1 text-[11px] text-slate-400">{status}</p>
    <div className="mt-3 flex flex-col gap-1" style={PANEL_SURFACE}>
      <Slider aria-label={t("ghost.amount")} min={20} max={85} value={Math.round((1 - review.threshold) * 100)} onChange={value => review.setThreshold(1 - value / 100)} />
      <span className="flex justify-between text-[10px] text-slate-500"><span>{t("ghost.fewer")}</span><span>{t("ghost.more")}</span></span>
    </div>
    <div className="mt-3 flex gap-1.5">
      <button className={`${button} text-teal-200`} disabled={!count} onClick={act(review.placeAll)}>{t("ghost.placeAll")}</button>
      <button className={button} onClick={act(() => review.setEnabled(false))}>{t("common.done")}</button>
    </div>
  </aside>;
}
