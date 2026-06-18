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

  for (const difficulty of difficulties) {
    const audio =
      (difficulty.audioFilename && audioFiles[difficulty.audioFilename]) ||
      fallbackAudio;
    if (audio && !bundled.has(audio.name)) {
      zip.file(audio.name, audio.blob);
      bundled.add(audio.name);
    }

    const osu = buildOsuFile({
      meta,
      difficulty,
      timingPoints: difficulty.timingPoints.length
        ? difficulty.timingPoints
        : timingPoints,
      audioFilename: audio?.name ?? difficulty.audioFilename ?? "audio.mp3",
      backgroundFilename: difficulty.backgroundFilename,
    });
    zip.file(osuFilename(meta, difficulty), osu);
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
