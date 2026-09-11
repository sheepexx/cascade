import type { useGhostNotes } from "../hooks/useGhostNotes";

export function GhostNotesPanel({ review, focusEditor, hasAudio }: {
  review: ReturnType<typeof useGhostNotes>; focusEditor: () => void; hasAudio: boolean;
}) {
  const act = (fn: () => void) => () => { fn(); focusEditor(); };
  const button = "flex-1 rounded-md border border-white/10 px-2 py-1.5 hover:bg-white/10 disabled:opacity-40";
  const count = review.ghosts.length;
  const status = !hasAudio ? "Load audio first" : review.busy ? "Listening…" : review.error || `${count} suggestion${count === 1 ? "" : "s"}`;
  return <aside aria-label="Note suggestions" className="absolute bottom-16 right-3 z-20 w-56 max-w-[calc(100%-1.5rem)] rounded-xl border border-teal-300/25 bg-ink-900/95 p-3 text-xs text-slate-300 shadow-xl backdrop-blur">
    <div className="flex items-center justify-between"><strong className="text-teal-200">Note suggestions</strong><button aria-label="Hide suggestions" onClick={act(() => review.setEnabled(false))}>×</button></div>
    <p role="status" className="mt-1 text-[11px] text-slate-400">{status}</p>
    <div className="mt-3 flex flex-col gap-1">
      <input type="range" aria-label="Number of suggestions" min="20" max="85" value={Math.round((1 - review.threshold) * 100)} onChange={e => review.setThreshold(1 - Number(e.target.value) / 100)} />
      <span className="flex justify-between text-[10px] text-slate-500"><span>Fewer</span><span>More</span></span>
    </div>
    <div className="mt-3 flex gap-1.5">
      <button className={`${button} text-teal-200`} disabled={!count} onClick={act(review.placeAll)}>Place all</button>
      <button className={button} onClick={act(() => review.setEnabled(false))}>Done</button>
    </div>
  </aside>;
}
