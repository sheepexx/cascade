import { uid, type Difficulty, type SongMeta, type TimingPoint } from "../types";
import { difficultyRate } from "./rateChange";
import { sortedPoints } from "./timing";
import { remapBookmarkLabels, sortedBookmarks } from "./bookmarks";

export type BatchOptions = { timing: "none" | "red" | "all"; preview: boolean; difficultySettings: boolean; bookmarks?: boolean };
export type BatchRequest = { sourceId: string; targetIds: string[]; options: BatchOptions; meta?: SongMeta };

export function batchApplyDifficulties(difficulties: Difficulty[], request: BatchRequest, fallback: TimingPoint[] = []): Difficulty[] {
  const source = difficulties.find(d => d.id === request.sourceId);
  if (!source) return difficulties;
  const targets = new Set(request.targetIds);
  if (!targets.size || (request.options.timing === "none" && !request.options.preview && !request.options.difficultySettings && !request.options.bookmarks)) return difficulties;
  return difficulties.map(d => {
    if (d.id === source.id || !targets.has(d.id)) return d;
    const next = { ...d };
    const ratio = difficultyRate(source) / difficultyRate(d);
    if (request.options.timing !== "none") {
      const points = source.timingPoints.length ? source.timingPoints : fallback;
      const incoming = points.filter(p => request.options.timing === "all" || p.uninherited).map(p => ({
        ...p, id: uid("tp"), time: Math.round(p.time * ratio), bpm: p.uninherited ? p.bpm / ratio : p.bpm,
      }));
      next.timingPoints = sortedPoints(request.options.timing === "all" ? incoming : [...d.timingPoints.filter(p => !p.uninherited), ...incoming]);
    }
    if (request.options.preview) next.previewTime = source.previewTime < 0 ? -1 : Math.round(source.previewTime * ratio);
    if (request.options.bookmarks) {
      // The source's bookmarks replace the target's, labels included, moved
      // onto the target's own clock when the two play at different rates.
      const toTarget = (ms: number) => Math.round(ms * ratio);
      const bookmarks = sortedBookmarks(source.bookmarks);
      next.bookmarks = bookmarks.length ? [...new Set(bookmarks.map(toTarget))] : undefined;
      next.bookmarkLabels = remapBookmarkLabels(bookmarks, source.bookmarkLabels, toTarget);
    }
    if (request.options.difficultySettings) {
      next.hpDrainRate = source.hpDrainRate; next.overallDifficulty = source.overallDifficulty; next.sampleSet = source.sampleSet;
    }
    return next;
  });
}
