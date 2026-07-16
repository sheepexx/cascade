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
  convertAudio,
  cutAudioName,
  cutDifficulty,
  decodeAudioBlob,
  effectiveRegion,
  isWav,
  renderTrimmedAudio,
  shiftTimingPoints,
  toMp3Name,
  type BakedRegion,
} from "./audioTrim";
import { isPngName, pngToJpeg, toJpegName, uniqueFileName } from "./imageConvert";

export type BuildOszArgs = {
  meta: SongMeta;
  difficulties: Difficulty[];
  timingPoints: TimingPoint[];
  audioFiles: Record<string, LoadedFile>;
  bgFiles?: Record<string, LoadedFile>;
  videoFiles?: Record<string, LoadedFile>;
  jpegQuality?: number;
};

export async function buildOsz({
  meta,
  difficulties,
  timingPoints,
  audioFiles,
  bgFiles,
  videoFiles,
  jpegQuality,
}: BuildOszArgs): Promise<Blob> {
  const zip = new JSZip();

  const bundledBgs = new Set<string>();
  const usedNames = new Set<string>();
  const bgExportName = new Map<string, string>();
  const convert = typeof jpegQuality === "number" && jpegQuality > 0;
  for (const difficulty of difficulties) {
    if (difficulty.backgroundFilename && bgFiles?.[difficulty.backgroundFilename]) {
      const bg = bgFiles[difficulty.backgroundFilename];
      if (!bundledBgs.has(bg.name)) {
        let outName = bg.name;
        let outBlob = bg.blob;
        if (convert && isPngName(bg.name)) {
          const jpeg = await pngToJpeg(bg.blob, jpegQuality!);
          if (jpeg) {
            outName = uniqueFileName(toJpegName(bg.name), usedNames);
            outBlob = jpeg;
          }
        }
        zip.file(outName, outBlob);
        usedNames.add(outName.toLowerCase());
        bundledBgs.add(bg.name);
        bgExportName.set(bg.name, outName);
      }
    }
    if (difficulty.videoFilename && videoFiles?.[difficulty.videoFilename]) {
      const video = videoFiles[difficulty.videoFilename];
      if (!bundledBgs.has(video.name)) {
        zip.file(video.name, video.blob);
        usedNames.add(video.name.toLowerCase());
        bundledBgs.add(video.name);
      }
    }
  }

  const allAudio = Object.values(audioFiles);
  const fallbackAudio = allAudio.length === 1 ? allAudio[0] : null;
  const bundled = new Set<string>();

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
            const encoded = renderTrimmedAudio(buffer, region);
            cutName = cutAudioName(audio.name, bundled, encoded.ext);
            zip.file(cutName, encoded.blob);
            bundled.add(cutName);
            cutNameByKey.set(key, cutName);
          }
          audioName = cutName;
          exportDiff = cutDifficulty(difficulty, region.startMs, region.endMs);
          exportTiming = shiftTimingPoints(resolvedTiming, region.startMs);
        }
      }

      if (audio && audioName === audio.name) {
        let effectiveName = audio.name;
        let effectiveBlob = audio.blob;
        if (isWav(audio.name)) {
          const ctx = ensureCtx();
          if (ctx) {
            const buffer = await decodeAudioBlob(audio.blob, ctx);
            if (buffer) {
              const encoded = convertAudio(buffer);
              effectiveName = toMp3Name(audio.name).replace(/\.mp3$/i, `.${encoded.ext}`);
              effectiveBlob = encoded.blob;
            }
          }
        }
        if (!bundled.has(effectiveName)) {
          zip.file(effectiveName, effectiveBlob);
          bundled.add(effectiveName);
        }
        audioName = effectiveName;
      }

      const osu = buildOsuFile({
        meta,
        difficulty: exportDiff,
        timingPoints: exportTiming.length ? exportTiming : timingPoints,
        audioFilename: audioName,
        backgroundFilename: difficulty.backgroundFilename
          ? bgExportName.get(difficulty.backgroundFilename) ??
            difficulty.backgroundFilename
          : undefined,
        videoFilename:
          difficulty.videoFilename && videoFiles?.[difficulty.videoFilename]
            ? difficulty.videoFilename
            : undefined,
        videoOffsetMs: exportDiff.videoOffsetMs,
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

export async function downloadOsz(args: BuildOszArgs): Promise<void> {
  const blob = await buildOsz(args);
  triggerDownload(blob, setFilename(args.meta));
}
