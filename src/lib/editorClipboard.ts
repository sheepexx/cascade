import { uid, type Difficulty, type ManiaNote, type SnapDivisor, type TimingPoint } from "../types";
import { withoutNoteCollisions } from "./noteCollision";
import { patternToNotes, type PatternNote } from "./patterns";
import { uniqueDifficultyName } from "./rateChange";
import { snapTime } from "./timing";
import { t } from "./i18n/core";

export const NOTE_CLIP_DRAG_TYPE = "application/x-cascade-note-clip";

export function positionPatternForDrop(
  pattern: PatternNote[],
  column: number,
  keyCount: number,
): PatternNote[] | null {
  if (!pattern.length || !Number.isInteger(column) || column < 0 || column >= keyCount) {
    return null;
  }
  let left = Infinity;
  let right = -Infinity;
  for (const note of pattern) {
    if (!Number.isInteger(note.column) || note.column < 0) return null;
    left = Math.min(left, note.column);
    right = Math.max(right, note.column);
  }
  const span = right - left + 1;
  if (span > keyCount) return null;
  const delta = Math.min(column, keyCount - span) - left;
  return pattern.map((note) => ({ ...note, column: note.column + delta }));
}

export function isClipboardTextTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (element?.isContentEditable) return true;
  if (element?.tagName === "TEXTAREA" || element?.tagName === "SELECT") return true;
  if (element?.tagName !== "INPUT") return false;
  return ![
    "range", "checkbox", "radio", "button", "submit",
    "reset", "color", "file", "image",
  ].includes((element as HTMLInputElement).type);
}

export function prepareNotePaste(
  pattern: PatternNote[],
  currentTime: number,
  keyCount: number,
  timingPoints: TimingPoint[],
  snapDivisor: SnapDivisor,
  existing: ManiaNote[],
  bounds: { lo: number; hi: number },
) {
  const base = snapTime(currentTime, timingPoints, snapDivisor);
  const candidates = patternToNotes(pattern, base, keyCount, timingPoints);
  const inBounds = candidates.filter(
    (n) =>
      n.startTime >= bounds.lo - 0.5 &&
      (n.endTime ?? n.startTime) <= bounds.hi + 0.5,
  );
  const notes = withoutNoteCollisions(inBounds, existing);
  const skipped = [
    candidates.length < pattern.length
      ? t("paste.skippedKeyCount", { count: pattern.length - candidates.length })
      : "",
    inBounds.length < candidates.length
      ? t("paste.skippedBounds", { count: candidates.length - inBounds.length })
      : "",
    notes.length < inBounds.length
      ? t("paste.skippedOverlap", { count: inBounds.length - notes.length })
      : "",
  ].filter(Boolean);
  const message = notes.length
    ? t("paste.pasted", { count: notes.length })
    : t("paste.nothing");
  return {
    candidates,
    notes,
    message: skipped.length
      ? `${message} ${t("paste.skipped", { list: skipped.join("; ") })}`
      : message,
  };
}

/**
 * A difficulty copied from any map, rebuilt to join this one: fresh ids so it
 * cannot collide with the one it came from, no beatmap id, a name not taken
 * here, and only asset names this map actually has. A missing audio file or
 * background falls back to the active difficulty's, or this map's only one.
 */
export function adoptCopiedDifficulty(
  source: Difficulty,
  target: {
    existingNames: Iterable<string>;
    audioFilenames: string[];
    backgroundFilenames: string[];
    videoFilenames: string[];
    base?: Pick<Difficulty, "audioFilename" | "backgroundFilename">;
  },
): Difficulty {
  const pick = (
    wanted: string | undefined,
    fallback: string | undefined,
    pool: string[],
  ) =>
    wanted && pool.includes(wanted)
      ? wanted
      : fallback && pool.includes(fallback)
        ? fallback
        : pool.length === 1
          ? pool[0]
          : undefined;
  const keepVideo =
    !!source.videoFilename && target.videoFilenames.includes(source.videoFilename);
  return {
    ...source,
    id: uid("diff"),
    name: uniqueDifficultyName(source.name, target.existingNames),
    beatmapId: undefined,
    audioFilename: pick(
      source.audioFilename,
      target.base?.audioFilename,
      target.audioFilenames,
    ),
    backgroundFilename: pick(
      source.backgroundFilename,
      target.base?.backgroundFilename,
      target.backgroundFilenames,
    ),
    videoFilename: keepVideo ? source.videoFilename : undefined,
    videoOffsetMs: keepVideo ? source.videoOffsetMs : undefined,
    timingPoints: source.timingPoints.map((p) => ({ ...p, id: uid("tp") })),
    notes: source.notes.map((n) => ({ ...n, id: uid("n") })),
  };
}
