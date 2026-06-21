import JSZip from "jszip";
import type {
  Difficulty,
  LoadedFile,
  SongMeta,
  TimingPoint,
} from "../types";
import {
  buildOsuFile,
  osuFilename,
  setFilename,
  triggerDownload,
} from "./osuExport";
import {
  cutAudioName,
  cutDifficulty,
  decodeAudioBlob,
  effectiveRegion,
  renderTrimmedWav,
  shiftTimingPoints,
  type BakedRegion,
} from "./audioTrim";

export type BuildOszArgs = {
  meta: SongMeta;
  difficulties: Difficulty[];
  timingPoints: TimingPoint[];
  /** Every audio file in the set, keyed by filename. */
  audioFiles: Record<string, LoadedFile>;
  /** Every background image in the set, keyed by filename. */
  bgFiles?: Record<string, LoadedFile>;
};

/**
 * Build a `.osz` archive (a plain zip) containing:
 *   - every audio file actually referenced by a difficulty (names preserved)
 *   - the background image, if provided
 *   - one `.osu` file per difficulty, each referencing its own audio
 */
export async function buildOsz({
  meta,
  difficulties,
  timingPoints,
  audioFiles,
  bgFiles,
}: BuildOszArgs): Promise<Blob> {
  const zip = new JSZip();

  // Bundle every unique background referenced by any difficulty.
  const bundledBgs = new Set<string>();
  for (const difficulty of difficulties) {
    if (difficulty.backgroundFilename && bgFiles?.[difficulty.backgroundFilename]) {
      const bg = bgFiles[difficulty.backgroundFilename];
      if (!bundledBgs.has(bg.name)) {
        zip.file(bg.name, bg.blob);
        bundledBgs.add(bg.name);
      }
    }
  }

  // Sets often share a single song; use it for any difficulty that hasn't
  // picked one explicitly.
  const allAudio = Object.values(audioFiles);
  const fallbackAudio = allAudio.length === 1 ? allAudio[0] : null;
  const bundled = new Set<string>();

  // Trim support. The brackets are non-destructive in the editor; here they
  // get baked in. We lazily create a single AudioContext (only when something
  // is actually trimmed), cache decoded buffers and encoded cut files so
  // difficulties sharing the same source + region reuse the work.
  const ctxHolder: { ctx: AudioContext | null } = { ctx: null };
  const decoded = new Map<string, Promise<AudioBuffer | null>>();
  const cutNameByKey = new Map<string, string>();

  const ensureCtx = (): AudioContext | null => {
    if (ctxHolder.ctx) return ctxHolder.ctx;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctxHolder.ctx = new AC();
    return ctxHolder.ctx;
  };

  const getDecoded = (audio: LoadedFile): Promise<AudioBuffer | null> => {
    let pr = decoded.get(audio.name);
    if (!pr) {
      const ctx = ensureCtx();
      pr = ctx ? decodeAudioBlob(audio.blob, ctx) : Promise.resolve(null);
      decoded.set(audio.name, pr);
    }
    return pr;
  };

  try {
    for (const difficulty of difficulties) {
      const audio =
        (difficulty.audioFilename && audioFiles[difficulty.audioFilename]) ||
        fallbackAudio;

      const resolvedTiming = difficulty.timingPoints.length
        ? difficulty.timingPoints
        : timingPoints;

      let audioName = audio?.name ?? difficulty.audioFilename ?? "audio.mp3";
      let exportDiff = difficulty;
      let exportTiming = resolvedTiming;

      // Only bother decoding when this difficulty actually trims the audio.
      const wantsTrim =
        (difficulty.trimStartMs ?? 0) > 0.5 ||
        difficulty.trimEndMs !== undefined;

      if (audio && wantsTrim) {
        const buffer = await getDecoded(audio);
        const region: BakedRegion | null = buffer
          ? effectiveRegion(difficulty, buffer.duration * 1000)
          : null;
        if (buffer && region) {
          const key = `${audio.name}|${region.startMs}|${region.endMs}|${region.fadeInMs}|${region.fadeOutMs}`;
          let cutName = cutNameByKey.get(key);
          if (!cutName) {
            cutName = cutAudioName(audio.name, bundled);
            zip.file(cutName, renderTrimmedWav(buffer, region));
            bundled.add(cutName);
            cutNameByKey.set(key, cutName);
          }
          audioName = cutName;
          exportDiff = cutDifficulty(difficulty, region.startMs, region.endMs);
          exportTiming = shiftTimingPoints(resolvedTiming, region.startMs);
        }
      }

      // Bundle the verbatim audio only when this difficulty isn't using a cut.
      if (audio && audioName === audio.name && !bundled.has(audio.name)) {
        zip.file(audio.name, audio.blob);
        bundled.add(audio.name);
      }

      const osu = buildOsuFile({
        meta,
        difficulty: exportDiff,
        timingPoints: exportTiming.length ? exportTiming : timingPoints,
        audioFilename: audioName,
        backgroundFilename: difficulty.backgroundFilename,
      });
      zip.file(osuFilename(meta, difficulty), osu);
    }
  } finally {
    ctxHolder.ctx?.close().catch(() => {});
  }

  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
}

/** Build and download the `.osz` in one step. */
export async function downloadOsz(args: BuildOszArgs): Promise<void> {
  const blob = await buildOsz(args);
  triggerDownload(blob, setFilename(args.meta));
}
