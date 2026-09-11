import { useEffect, useMemo, useState } from "react";
import type { ManiaNote, TimingPoint } from "../types";
import { uid } from "../types";
import { suggestGhostNotes } from "../lib/ghostNotes";
import { withoutNoteCollisions } from "../lib/noteCollision";
import { useOnsets } from "./useOnsets";

export function useGhostNotes(options: {
  buffer: AudioBuffer | null; notes: ManiaNote[]; timingPoints: TimingPoint[];
  snapDivisor: number; timeScale: number; keyCount: number; start: number; end: number;
  onAdd: (notes: ManiaNote[]) => void;
  enabled: boolean; onEnabled: (enabled: boolean) => void;
}) {
  const { enabled, onEnabled: setEnabled } = options;
  const [threshold, setThreshold] = useState(0.55);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const analysis = useOnsets(options.buffer, enabled);
  useEffect(() => { setDismissed(new Set()); }, [options.buffer, enabled]);
  const { notes, timingPoints, snapDivisor, timeScale, keyCount, start, end } = options;
  const ghosts = useMemo(() => enabled ? suggestGhostNotes(analysis.onsets, {
    notes, timingPoints, snapDivisor, timeScale, keyCount, start, end, threshold,
  }).filter(n => !dismissed.has(n.id)) : [],
  [enabled, analysis.onsets, notes, timingPoints, snapDivisor, timeScale, keyCount, start, end, threshold, dismissed]);
  const placeAll = () => {
    const placeable = withoutNoteCollisions(ghosts, notes);
    if (placeable.length) options.onAdd(placeable.map(n => ({ id: uid("n"), column: n.column, startTime: n.startTime, ...(n.endTime !== undefined ? { endTime: n.endTime } : {}) })));
  };
  const dismiss = (id: string) => setDismissed(prev => new Set([...prev, id]));
  const onKey = (event: KeyboardEvent) => {
    if (!enabled || event.key !== "Escape" || event.ctrlKey || event.metaKey || event.altKey) return false;
    setEnabled(false);
    event.preventDefault(); return true;
  };
  return { enabled, setEnabled, threshold, setThreshold, ghosts, placeAll, dismiss, onKey, ...analysis };
}
