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
  audio: LoadedFile;
  background?: LoadedFile | null;
};

/**
 * Build a `.osz` archive (a plain zip) containing:
 *   - the audio file (original name preserved)
 *   - the background image, if provided
 *   - one `.osu` file per difficulty, all referencing the shared media
 */
export async function buildOsz({
  meta,
  difficulties,
  timingPoints,
  audio,
  background,
}: BuildOszArgs): Promise<Blob> {
  const zip = new JSZip();

  zip.file(audio.name, audio.blob);
  if (background) zip.file(background.name, background.blob);

  for (const difficulty of difficulties) {
    const osu = buildOsuFile({
      meta,
      difficulty,
      timingPoints: difficulty.timingPoints.length
        ? difficulty.timingPoints
        : timingPoints,
      audioFilename: audio.name,
      backgroundFilename: background?.name,
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
