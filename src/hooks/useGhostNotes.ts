import { useEffect, useMemo, useState } from "react";
import type { ManiaNote, TimingPoint } from "../types";
import { uid } from "../types";
import { suggestGhostNotes } from "../lib/ghostNotes";
import { withoutNoteCollisions } from "../lib/noteCollision";
import { useOnsets } from "./useOnsets";

export function useGhostNotes(options: {
  buffer: AudioBuffer | null; notes: ManiaNote[]; timingPoints: TimingPoint[];
  snapDivisor: number; timeScale: number; keyCount: number; start: number; end: number;
  onSeek: (time: number) => void; onAdd: (notes: ManiaNote[]) => void; getTime: () => number;
}) {
  const [enabled, setEnabled] = useState(false);
  const [threshold, setThreshold] = useState(0.55);
  const [focused, setFocused] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [lanes, setLanes] = useState<Record<string, number>>({});
  const analysis = useOnsets(options.buffer, enabled);
  useEffect(() => { setSkipped(new Set()); setFocused(null); setLanes({}); }, [options.buffer]);
  const { notes, timingPoints, snapDivisor, timeScale, keyCount, start, end } = options;
  const ghosts = useMemo(() => enabled ? suggestGhostNotes(analysis.onsets, {
    notes, timingPoints, snapDivisor, timeScale, keyCount, start, end, threshold,
  }).filter(n => !skipped.has(n.id)).map(n => ({ ...n, column: lanes[n.id] ?? n.column })) : [],
  [enabled, analysis.onsets, notes, timingPoints, snapDivisor, timeScale, keyCount, start, end, threshold, skipped, lanes]);
  const index = ghosts.findIndex(n => n.id === focused);
  const current = index >= 0 ? ghosts[index] : null;
  const select = (i: number) => {
    const n = ghosts[(i + ghosts.length) % ghosts.length];
    if (n) { setFocused(n.id); options.onSeek(n.startTime); }
  };
  const next = (direction = 1) => {
    if (index >= 0) select(index + direction);
    else {
      const nearest = ghosts.findIndex(n => n.startTime >= options.getTime() - 1);
      select(nearest < 0 ? 0 : nearest);
    }
  };
  const advance = () => {
    const n = ghosts[index + 1];
    setFocused(n?.id ?? null);
    if (n) options.onSeek(n.startTime);
  };
  const canAccept = !!current && withoutNoteCollisions([current], notes).length > 0;
  const accept = () => {
    if (!current || !canAccept) return;
    options.onAdd([{ id: uid("n"), column: current.column, startTime: current.startTime }]);
    advance();
  };
  const skip = () => {
    if (!current) return;
    setSkipped(prev => new Set([...prev, current.id])); advance();
  };
  const move = (delta: number) => {
    if (current) setLanes(prev => ({ ...prev, [current.id]: (current.column + delta + keyCount) % keyCount }));
  };
  const onKey = (event: KeyboardEvent) => {
    if (!enabled || event.ctrlKey || event.metaKey || event.altKey) return false;
    if (event.key === "Tab") next(event.shiftKey ? -1 : 1);
    else if (event.key === "Escape") { setFocused(null); setEnabled(false); }
    else if (!current || event.repeat) return false;
    else if (event.key === "Enter") accept();
    else if (event.key === "Delete" || event.key === "Backspace") skip();
    else if (event.key === "ArrowLeft") move(-1);
    else if (event.key === "ArrowRight") move(1);
    else return false;
    event.preventDefault(); return true;
  };
  return { enabled, setEnabled, threshold, setThreshold, ghosts, current, index, next, accept, skip, move, canAccept, onKey,
    reset: () => { setSkipped(new Set()); setFocused(null); setLanes({}); }, ...analysis };
}
