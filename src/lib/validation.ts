import type { Difficulty, LoadedFile, ManiaNote, SongMeta } from "../types";
import { MAX_KEYS, MIN_KEYS } from "../types";
import { isRateDifficulty } from "./rateChange";
import { t } from "./i18n/core";

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
  /** Export target, e.g. ".osu" / ".osz" / ".sm". Enables format-specific checks. */
  target?: string;
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
  target,
}: ValidateArgs): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const duplicateNoteIds: Record<string, string[]> = {};
  let duplicateCount = 0;

  if (Object.keys(audioFiles).length === 0)
    errors.push({ message: t("validation.missingAudio") });

  // .sm has no per-chart audio, and Etterna applies rates in-game, so rate
  // difficulties are skipped rather than exported out of sync.
  if (target === ".sm") {
    const rated = difficulties.filter(isRateDifficulty);
    if (rated.length === difficulties.length && rated.length > 0) {
      errors.push({
        message: t("validation.allRated"),
      });
    } else if (rated.length > 0) {
      warnings.push({
        message: t("validation.ratedSkipped", { count: rated.length }),
        scope: rated.map((d) => d.name || t("app.unnamed")).join(", "),
      });
    }
  }
  if (!meta.title.trim()) errors.push({ message: t("validation.missingTitle") });
  if (!meta.artist.trim()) errors.push({ message: t("validation.missingArtist") });
  if (!meta.creator.trim()) errors.push({ message: t("aimod.missingCreator") });

  for (const d of difficulties) {
    const scope = d.name || t("app.unnamed");

    if (!d.name.trim())
      errors.push({ message: t("validation.missingDiffName"), scope });

    if (
      !Number.isInteger(d.keyCount) ||
      d.keyCount < MIN_KEYS ||
      d.keyCount > MAX_KEYS
    )
      errors.push({
        message: t("validation.invalidKeys", { keys: d.keyCount, min: MIN_KEYS, max: MAX_KEYS }),
        scope,
      });

    if (Object.keys(audioFiles).length > 0 && !resolveAudio(d, audioFiles))
      errors.push({ message: t("validation.noAudio"), scope });

    const reds = d.timingPoints.filter((p) => p.uninherited);
    if (reds.length === 0)
      errors.push({ message: t("validation.noRed"), scope });

    let invalidColumn = 0;
    let invalidLong = 0;
    for (const n of d.notes) {
      if (n.column < 0 || n.column >= d.keyCount) invalidColumn++;
      if (n.endTime !== undefined && n.endTime <= n.startTime) invalidLong++;
    }
    if (invalidColumn > 0)
      errors.push({
        message: t("validation.invalidColumn", { count: invalidColumn }),
        scope,
      });
    if (invalidLong > 0)
      errors.push({
        message: t("validation.invalidLong", { count: invalidLong }),
        scope,
      });

    if (!d.backgroundFilename || !bgFiles[d.backgroundFilename])
      warnings.push({ message: t("aimod.noBackground"), scope });
    if (d.notes.length === 0)
      warnings.push({ message: t("validation.noNotes"), scope });

    const dupes = findDuplicateIds(d.notes);
    if (dupes.length > 0) {
      duplicateNoteIds[d.id] = dupes;
      duplicateCount += dupes.length;
      warnings.push({
        message: t("validation.duplicates", { count: dupes.length }),
        scope,
      });
    }

    if (hasColumnOverlap(d.notes))
      warnings.push({
        message: t("validation.overlap"),
        scope,
      });
  }

  return { errors, warnings, duplicateNoteIds, duplicateCount };
}
