import type { Difficulty, ManiaNote, SongMeta, TimingPoint } from "../types";
import { isValidNote } from "./chartValidation";
import { insertByTime } from "./ops";

/**
 * Three-way merge of a chart, for when this window's unsaved copy and a
 * collaborator's newer saved copy both changed the version they started
 * from (`base`). Each value that only one side changed takes that side's
 * value, so both people's edits survive: different notes, different fields
 * of one note, different difficulties, timing and metadata all combine.
 *
 * When both sides changed the same value differently, the saved copy wins:
 * it is what everyone else already has, and a stale copy must not overwrite
 * newer work. Those values are counted as conflicts so the caller can keep
 * this window's version recoverable before applying the result. A value one
 * side edited and the other deleted is kept, edited, since keeping work is
 * easier to undo than losing it.
 *
 * With no base (nothing is known about where this copy came from), every
 * value counts as added on both sides: nothing is deleted, and a value that
 * differs is a conflict the saved copy wins.
 */

export type MergeableChart = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

export type Merged<T> = { value: T; conflicts: number };

/** Equality for JSON-shaped values; a missing key and an undefined one match. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  for (const key in left) {
    if (left[key] !== undefined && !sameValue(left[key], right[key])) return false;
  }
  for (const key in right) {
    if (right[key] !== undefined && left[key] === undefined) return false;
  }
  return true;
}

/** One value: whichever side changed it; the saved copy when both did. */
function mergeValue<T>(base: T | undefined, local: T | undefined, remote: T | undefined, hasBase: boolean): Merged<T | undefined> {
  if (hasBase) {
    if (sameValue(remote, base)) return { value: local, conflicts: 0 };
    if (sameValue(local, base)) return { value: remote, conflicts: 0 };
  }
  if (sameValue(local, remote)) return { value: local, conflicts: 0 };
  if (!hasBase && (local === undefined || remote === undefined)) {
    return { value: local ?? remote, conflicts: 0 };
  }
  return { value: remote, conflicts: 1 };
}

/** A flat record field by field, leaving out the keys in `skip`. */
function mergeFields<T extends object>(
  base: T | undefined,
  local: T,
  remote: T,
  skip: ReadonlySet<string> = new Set(),
): Merged<T> {
  if (base && sameValue(remote, base)) return { value: local, conflicts: 0 };
  if (base && sameValue(local, base)) return { value: remote, conflicts: 0 };
  const b = (base ?? {}) as Record<string, unknown>;
  const l = local as Record<string, unknown>;
  const r = remote as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let conflicts = 0;
  for (const key of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b)])) {
    if (skip.has(key)) continue;
    const merged = mergeValue(b[key], l[key], r[key], base !== undefined);
    conflicts += merged.conflicts;
    if (merged.value !== undefined) out[key] = merged.value;
  }
  return { value: out as T, conflicts };
}

function hasDuplicateIds(list: readonly { id: string }[]): boolean {
  const seen = new Set<string>();
  for (const item of list) {
    if (seen.has(item.id)) return true;
    seen.add(item.id);
  }
  return false;
}

/**
 * A list of things with ids (notes, timing points, difficulties), item by
 * item. The result keeps the saved copy's order, with this window's own
 * additions placed by `insert`.
 */
function mergeList<T extends { id: string }>(
  base: readonly T[] | undefined,
  local: readonly T[],
  remote: readonly T[],
  mergeItem: (base: T | undefined, local: T, remote: T) => Merged<T>,
  insert: (list: T[], add: T[]) => T[],
): Merged<T[]> {
  if (base === local) return { value: remote.slice(), conflicts: 0 };
  if (base && sameValue(remote, base)) return { value: local.slice(), conflicts: 0 };
  // Ids tie a value across copies; without unique ids nothing can be matched
  // safely, so the list is merged as one value.
  if (hasDuplicateIds(local) || hasDuplicateIds(remote) || (base && hasDuplicateIds(base))) {
    const whole = mergeValue(base, local, remote, base !== undefined);
    return { value: (whole.value ?? remote).slice(), conflicts: whole.conflicts };
  }
  const baseById = new Map((base ?? []).map((item) => [item.id, item]));
  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteIds = new Set(remote.map((item) => item.id));
  let conflicts = 0;

  const resolve = (b: T | undefined, l: T | undefined, r: T | undefined): T | undefined => {
    if (l && r) {
      if (l === b) return r;
      const merged = mergeItem(b, l, r);
      conflicts += merged.conflicts;
      return merged.value;
    }
    const present = l ?? r;
    if (!present) return undefined;
    // Only one side has it. Without a base it was added there; with one, it
    // was added there or deleted on the other side.
    if (!base || !b) return present;
    if (sameValue(present, b)) return undefined;
    // Edited on one side, deleted on the other: keep the edit.
    conflicts += 1;
    return present;
  };

  const out: T[] = [];
  for (const r of remote) {
    const kept = resolve(baseById.get(r.id), localById.get(r.id), r);
    if (kept) out.push(kept);
  }
  const added: T[] = [];
  for (const l of local) {
    if (remoteIds.has(l.id)) continue;
    const kept = resolve(baseById.get(l.id), l, undefined);
    if (kept) added.push(kept);
  }
  return { value: added.length ? insert(out, added) : out, conflicts };
}

const append = <T>(list: T[], add: T[]) => [...list, ...add];

function insertTimingPoints(list: TimingPoint[], add: TimingPoint[]): TimingPoint[] {
  const out = list.slice();
  for (const point of add) {
    let at = out.length;
    while (at > 0 && out[at - 1].time > point.time) at -= 1;
    out.splice(at, 0, point);
  }
  return out;
}

function mergeNote(base: ManiaNote | undefined, local: ManiaNote, remote: ManiaNote): Merged<ManiaNote> {
  const merged = mergeFields(base, local, remote);
  // Fields from two edits can combine into a hold that ends before it starts.
  if (merged.value.endTime !== undefined && !(merged.value.endTime > merged.value.startTime)) {
    return { value: remote, conflicts: merged.conflicts + 1 };
  }
  return merged;
}

const mergeTimingPoint = (base: TimingPoint | undefined, local: TimingPoint, remote: TimingPoint) =>
  mergeFields(base, local, remote);

export function mergeTimingPoints(
  base: readonly TimingPoint[] | undefined,
  local: readonly TimingPoint[],
  remote: readonly TimingPoint[],
): Merged<TimingPoint[]> {
  return mergeList(base, local, remote, mergeTimingPoint, insertTimingPoints);
}

const DIFFICULTY_LISTS: ReadonlySet<string> = new Set(["notes", "timingPoints"]);

function mergeDifficulty(base: Difficulty | undefined, local: Difficulty, remote: Difficulty): Merged<Difficulty> {
  const fields = mergeFields(base, local, remote, DIFFICULTY_LISTS);
  const notes = mergeList(base?.notes, local.notes, remote.notes, mergeNote, insertByTime);
  const timing = mergeTimingPoints(base?.timingPoints, local.timingPoints, remote.timingPoints);
  const value: Difficulty = { ...fields.value, notes: notes.value, timingPoints: timing.value };
  // One side changing the key count while the other placed notes can leave
  // a note outside the layout; then this difficulty is taken as saved.
  if (!value.notes.every((note) => isValidNote(note, value.keyCount))) {
    return { value: remote, conflicts: fields.conflicts + notes.conflicts + timing.conflicts + 1 };
  }
  return { value, conflicts: fields.conflicts + notes.conflicts + timing.conflicts };
}

export function mergeDifficulties(
  base: readonly Difficulty[] | undefined,
  local: readonly Difficulty[],
  remote: readonly Difficulty[],
): Merged<Difficulty[]> {
  return mergeList(base, local, remote, mergeDifficulty, append);
}

export function mergeMeta(base: SongMeta | undefined, local: SongMeta, remote: SongMeta): Merged<SongMeta> {
  return mergeFields(base, local, remote);
}

export function mergeCharts(
  base: MergeableChart | null,
  local: MergeableChart,
  remote: MergeableChart,
): Merged<MergeableChart> {
  const meta = base?.meta === local.meta
    ? { value: remote.meta, conflicts: 0 }
    : mergeMeta(base?.meta, local.meta, remote.meta);
  const timingPoints = mergeTimingPoints(base?.timingPoints, local.timingPoints, remote.timingPoints);
  const difficulties = mergeDifficulties(base?.difficulties, local.difficulties, remote.difficulties);
  return {
    value: { meta: meta.value, timingPoints: timingPoints.value, difficulties: difficulties.value },
    conflicts: meta.conflicts + timingPoints.conflicts + difficulties.conflicts,
  };
}
