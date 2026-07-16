import type { Difficulty, LoadedFile, ManiaNote, SongMeta } from "../types";
import { MAX_KEYS, MIN_KEYS } from "../types";

export type ValidationIssue = {
  message: string;
  scope?: string;
};

export type ValidationResult = {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  duplicateNoteIds: Record<string, string[]>;
  duplicateCount: number;
};

export type ValidateArgs = {
  meta: SongMeta;
  difficulties: Difficulty[];
  audioFiles: Record<string, LoadedFile>;
  bgFiles: Record<string, LoadedFile>;
};

function resolveAudio(
  d: Difficulty,
  audioFiles: Record<string, LoadedFile>,
): LoadedFile | null {
  const named = d.audioFilename ? audioFiles[d.audioFilename] : null;
  if (named) return named;
  const all = Object.values(audioFiles);
  return all.length === 1 ? all[0] : null;
}

function findDuplicateIds(notes: ManiaNote[]): string[] {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const n of notes) {
    const key = `${n.column}@${n.startTime}`;
    if (seen.has(key)) dupes.push(n.id);
    else seen.add(key);
  }
  return dupes;
}

function hasColumnOverlap(notes: ManiaNote[]): boolean {
  const byCol = new Map<number, ManiaNote[]>();
  for (const n of notes) {
    const arr = byCol.get(n.column);
    if (arr) arr.push(n);
    else byCol.set(n.column, [n]);
  }
  for (const arr of byCol.values()) {
    arr.sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < arr.length; i++) {
      const prev = arr[i - 1];
      const cur = arr[i];
      const prevEnd = prev.endTime ?? prev.startTime;
      if (cur.startTime < prevEnd) return true;
    }
  }
  return false;
}

export function validateProject({
  meta,
  difficulties,
  audioFiles,
  bgFiles,
}: ValidateArgs): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const duplicateNoteIds: Record<string, string[]> = {};
  let duplicateCount = 0;

  if (Object.keys(audioFiles).length === 0)
    errors.push({ message: "Missing audio file." });
  if (!meta.title.trim()) errors.push({ message: "Missing song title." });
  if (!meta.artist.trim()) errors.push({ message: "Missing artist." });
  if (!meta.creator.trim()) errors.push({ message: "Missing creator." });

  for (const d of difficulties) {
    const scope = d.name || "(unnamed)";

    if (!d.name.trim())
      errors.push({ message: "Missing difficulty name.", scope });

    if (
      !Number.isInteger(d.keyCount) ||
      d.keyCount < MIN_KEYS ||
      d.keyCount > MAX_KEYS
    )
      errors.push({
        message: `Invalid key count (${d.keyCount}). Must be ${MIN_KEYS}–${MAX_KEYS}.`,
        scope,
      });

    if (Object.keys(audioFiles).length > 0 && !resolveAudio(d, audioFiles))
      errors.push({ message: "Difficulty has no resolvable audio.", scope });

    const reds = d.timingPoints.filter((p) => p.uninherited);
    if (reds.length === 0)
      errors.push({ message: "No red (uninherited) timing point.", scope });

    let invalidColumn = 0;
    let invalidLong = 0;
    for (const n of d.notes) {
      if (n.column < 0 || n.column >= d.keyCount) invalidColumn++;
      if (n.endTime !== undefined && n.endTime <= n.startTime) invalidLong++;
    }
    if (invalidColumn > 0)
      errors.push({
        message: `${invalidColumn} note(s) in an invalid column.`,
        scope,
      });
    if (invalidLong > 0)
      errors.push({
        message: `${invalidLong} invalid long note(s) (end ≤ start).`,
        scope,
      });

    if (!d.backgroundFilename || !bgFiles[d.backgroundFilename])
      warnings.push({ message: "No background image.", scope });
    if (d.notes.length === 0)
      warnings.push({ message: "No notes.", scope });

    const dupes = findDuplicateIds(d.notes);
    if (dupes.length > 0) {
      duplicateNoteIds[d.id] = dupes;
      duplicateCount += dupes.length;
      warnings.push({
        message: `${dupes.length} duplicate note(s) (same column & time).`,
        scope,
      });
    }

    if (hasColumnOverlap(d.notes))
      warnings.push({
        message: "Overlapping notes in the same column.",
        scope,
      });
  }

  return { errors, warnings, duplicateNoteIds, duplicateCount };
}
