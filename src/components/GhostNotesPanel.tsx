import type { useGhostNotes } from "../hooks/useGhostNotes";
import { formatAiModTime } from "../lib/aimod";

export function GhostNotesPanel({ review, focusEditor, hasAudio }: {
  review: ReturnType<typeof useGhostNotes>; focusEditor: () => void; hasAudio: boolean;
}) {
  const act = (fn: () => void) => () => { fn(); focusEditor(); };
  const button = "rounded-md border border-white/10 px-2 py-1.5 hover:bg-white/10 disabled:opacity-40";
  return <aside aria-label="Ghost note suggestions" className="absolute bottom-16 right-3 z-20 w-64 max-w-[calc(100%-1.5rem)] rounded-xl border border-teal-300/25 bg-ink-900/95 p-3 text-xs text-slate-300 shadow-xl backdrop-blur">
    <div className="flex items-center justify-between"><strong className="text-teal-200">Ghost notes</strong><button aria-label="Close ghost notes" onClick={act(() => review.setEnabled(false))}>×</button></div>
    <p className="mt-2 text-[11px] text-slate-400">Suggested attacks on your current snap grid. Lanes are a starting point; choose what fits the music.</p>
    <label className="my-3 flex flex-col gap-1">Detection sensitivity
      <input type="range" min="20" max="85" value={Math.round((1 - review.threshold) * 100)} onChange={e => review.setThreshold(1 - Number(e.target.value) / 100)} />
      <span className="flex justify-between text-[10px] text-slate-500"><span>Strong attacks</span><span>More detail</span></span>
    </label>
    <p role="status" className="mb-2 text-teal-100">{!hasAudio ? "Load audio to find suggestions." : review.busy ? "Listening for attacks…" : review.error || (review.current ? `${review.index + 1} / ${review.ghosts.length} · ${formatAiModTime(review.current.startTime)} · lane ${review.current.column + 1}` : `${review.ghosts.length} suggestions to review`)}</p>
    <div className="flex flex-wrap gap-1.5">
      <button className={button} disabled={!review.ghosts.length} onClick={act(() => review.next(-1))} aria-label="Previous suggestion">←</button>
      <button className={button} disabled={!review.ghosts.length} onClick={act(() => review.next())}>Next · Tab</button>
      <button className={`${button} text-teal-200`} disabled={!review.canAccept} onClick={act(review.accept)}>Accept · Enter</button>
      <button className={button} disabled={!review.current} onClick={act(review.skip)}>Skip</button>
      <button className={button} onClick={act(review.reset)}>Reset review</button>
    </div>
    <p className="mt-2 text-[10px] text-slate-500">While the notefield is focused: Shift+Tab back · ←/→ change lane · Delete skip · Esc finish.</p>
    {review.current && !review.canAccept && <p className="mt-2 text-amber-200">This lane is occupied. Choose another lane.</p>}
  </aside>;
}
