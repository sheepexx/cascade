import {
  normalizeTimingPoints,
  uid,
  type Difficulty,
  type SongMeta,
  type TimingPoint,
} from "../types";
import { bookmarkKey } from "./bookmarks";
import { isManiaOsu, parseOsuFile } from "./osuImport";
import { isDesktopApp } from "./pwa";
import { t } from "./i18n/core";

/**
 * "Edit externally", after osu!lazer: the active difficulty goes out as a
 * `.osu` file to a text editor and comes back in when the mapper applies it.
 * Desktop only; the file lives in a private folder the app cleans up.
 */

async function invoker() {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke;
}

export function canEditExternally(): boolean {
  return isDesktopApp();
}

/** Writes the file and returns its path, which the other calls take. */
export async function startExternalEdit(name: string, contents: string): Promise<string> {
  const invoke = await invoker();
  return await invoke<string>("external_edit_start", { name, contents });
}

/** Opens the file in a text editor, or shows it in its folder. */
export async function showExternalEdit(path: string, inFolder: boolean): Promise<void> {
  const invoke = await invoker();
  await invoke("external_edit_show", { path, inFolder });
}

export async function readExternalEdit(path: string): Promise<string> {
  const invoke = await invoker();
  return await invoke<string>("external_edit_read", { path });
}

/** Deletes the file. Failing to is harmless: stale sessions are swept later. */
export async function finishExternalEdit(path: string): Promise<void> {
  try {
    const invoke = await invoker();
    await invoke("external_edit_finish", { path });
  } catch {
    // Nothing to tell the mapper about.
  }
}

export type LoadedNames = {
  audio: string[];
  backgrounds: string[];
  videos: string[];
};

function loaded(wanted: string | null | undefined, pool: string[]): string | undefined {
  if (!wanted) return undefined;
  const lower = wanted.toLowerCase();
  return pool.find((name) => name.toLowerCase() === lower);
}

function timingSignature(points: TimingPoint[]): string {
  return JSON.stringify(
    [...points]
      .sort((a, b) => a.time - b.time || Number(b.uninherited) - Number(a.uninherited))
      .map((p) => [
        Math.round(p.time),
        p.uninherited,
        p.uninherited ? Math.round(p.bpm * 1000) : Math.round(p.sv * 1000),
        p.meter,
        p.sampleSet,
        p.sampleIndex,
        p.volume,
        !!p.kiai,
        !!p.omitFirstBarline,
      ]),
  );
}

export type ExternalEditResult = { difficulty: Difficulty; meta: SongMeta };

/**
 * Folds an edited `.osu` back into the difficulty it came from. Everything the
 * file describes is taken from it; what only Cascade knows (the audio rate,
 * trims and fades, bookmark labels that still have a bookmark) is kept, and
 * file references only change to files the project actually has.
 *
 * Throws a message fit to show the mapper when the text isn't a mania map.
 */
export function applyExternalOsu(
  current: Difficulty,
  meta: SongMeta,
  sharedTiming: TimingPoint[],
  text: string,
  names: LoadedNames,
): ExternalEditResult {
  if (!/\[HitObjects\]/i.test(text) || !isManiaOsu(text))
    throw new Error(t("externalEdit.notMania"));
  const parsed = parseOsuFile(text);
  const edited = parsed.difficulty;

  const timingPoints = normalizeTimingPoints(
    edited.timingPoints.map((point) => ({ ...point, id: uid("tp") })),
  );
  // A difficulty following the mapset's shared timing keeps following it when
  // the file's timing wasn't touched, rather than quietly getting its own copy.
  const keepShared =
    current.timingPoints.length === 0 &&
    timingSignature(timingPoints) === timingSignature(sharedTiming);

  const bookmarks = edited.bookmarks?.length ? edited.bookmarks : undefined;
  let bookmarkLabels: Record<string, string> | undefined;
  if (bookmarks && current.bookmarkLabels) {
    const kept = new Set(bookmarks.map(bookmarkKey));
    const entries = Object.entries(current.bookmarkLabels).filter(([key]) => kept.has(key));
    bookmarkLabels = entries.length ? Object.fromEntries(entries) : undefined;
  }

  const videoFilename = parsed.videoFilename
    ? loaded(parsed.videoFilename, names.videos) ?? current.videoFilename
    : undefined;

  const difficulty: Difficulty = {
    ...current,
    name: edited.name.trim() || current.name,
    keyCount: edited.keyCount,
    hpDrainRate: edited.hpDrainRate,
    overallDifficulty: edited.overallDifficulty,
    previewTime: edited.previewTime,
    beatmapId: edited.beatmapId,
    sampleSet: edited.sampleSet,
    bookmarks,
    bookmarkLabels,
    audioFilename: loaded(parsed.audioFilename, names.audio) ?? current.audioFilename,
    backgroundFilename: parsed.backgroundFilename
      ? loaded(parsed.backgroundFilename, names.backgrounds) ?? current.backgroundFilename
      : undefined,
    videoFilename,
    videoOffsetMs: videoFilename ? parsed.videoOffsetMs || undefined : undefined,
    timingPoints: keepShared ? [] : timingPoints,
    notes: edited.notes.map((note) => ({ ...note, id: uid("n") })),
  };

  return {
    difficulty,
    meta: {
      ...meta,
      title: parsed.meta.title,
      artist: parsed.meta.artist,
      creator: parsed.meta.creator,
      source: parsed.meta.source,
      tags: parsed.meta.tags,
      titleUnicode: parsed.meta.titleUnicode,
      artistUnicode: parsed.meta.artistUnicode,
      beatmapSetId: parsed.meta.beatmapSetId,
    },
  };
}
