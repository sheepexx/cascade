import type { Difficulty, LoadedFile, ManiaNote, SongMeta } from "../types";
import { MAX_KEYS, MIN_KEYS } from "../types";
import { isRateDifficulty } from "./rateChange";
import { t } from "./i18n/core";
import { smStepsType } from "./smFormat";
import { CHART_LIMITS, isFiniteNumber, noteProblem, timingPointProblem } from "./chartValidation";

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

function isExportTime(value: unknown): boolean {
  return isFiniteNumber(value) && Math.abs(value) <= CHART_LIMITS.maxAbsTimeMs;
}

/** A difficulty setting the exporters write out as a number but that isn't one. */
function hasInvalidDifficultyValue(d: Difficulty): boolean {
  return (
    !isFiniteNumber(d.hpDrainRate) ||
    !isFiniteNumber(d.overallDifficulty) ||
    !isExportTime(d.previewTime) ||
    (d.videoOffsetMs !== undefined && !isFiniteNumber(d.videoOffsetMs)) ||
    (d.audioRate !== undefined && !(isFiniteNumber(d.audioRate) && d.audioRate > 0)) ||
    (d.bookmarks ?? []).some((b) => !isExportTime(b))
  );
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
    const unsupported = difficulties.filter((d) => smStepsType(d.keyCount) === null);
    if (unsupported.length === difficulties.length && unsupported.length > 0) {
      errors.push({ message: t("validation.smNoKeyCount") });
    } else if (unsupported.length > 0) {
      warnings.push({
        message: t("validation.smKeyCountSkipped", { count: unsupported.length }),
        scope: unsupported.map((d) => `${d.name || t("app.unnamed")} (${d.keyCount}K)`).join(", "),
      });
    }
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

    // The same checks a cloud copy or a collaborator's edit has to pass, so
    // nothing the format can't hold (a NaN time, a fractional or out-of-range
    // column) reaches an exported file.
    let invalidColumn = 0;
    let invalidLong = 0;
    let invalidTime = 0;
    let invalidNoteValue = 0;
    for (const n of d.notes) {
      const found = noteProblem(n, d.keyCount);
      if (!found) continue;
      if (found.problem === "column") invalidColumn++;
      else if (found.problem === "hold") invalidLong++;
      else if (found.problem === "time") invalidTime++;
      else invalidNoteValue++;
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
    if (invalidTime > 0)
      errors.push({
        message: t("validation.invalidTime", { count: invalidTime }),
        scope,
      });
    if (invalidNoteValue > 0)
      errors.push({
        message: t("validation.invalidNoteValue", { count: invalidNoteValue }),
        scope,
      });
    const invalidTiming = d.timingPoints.filter((p) => timingPointProblem(p) !== null).length;
    if (invalidTiming > 0)
      errors.push({
        message: t("validation.invalidTiming", { count: invalidTiming }),
        scope,
      });
    if (hasInvalidDifficultyValue(d))
      errors.push({ message: t("validation.invalidDifficultyValue"), scope });

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
