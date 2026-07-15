import { isAudioName, isImageName, parseSmFile, type ParsedSm } from "./smImport";

export type PackSongInfo = {
  title: string;
  artist: string;
  creator: string;
  dirName: string;
  sourceSmName: string;
  audioFilename: string | null;
  backgroundFilename: string | null;
  difficulties: { name: string; keys: number }[];
};

export type PackSong = {
  info: PackSongInfo;
  parsed: ParsedSm;
  audioBlobs: Record<string, Blob>;
  bgBlobs: Record<string, Blob>;
};

function groupFilesByDir(
  files: { file: File; relPath: string }[],
): Map<string, { sm: { file: File; relPath: string }[]; audio: File[]; bg: File[] }> {
  const dirs = new Map<
    string,
    { sm: { file: File; relPath: string }[]; audio: File[]; bg: File[] }
  >();

  for (const { file, relPath } of files) {
    const parts = relPath.replace(/\\/g, "/").split("/");
    const dir = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    if (!dirs.has(dir)) {
      dirs.set(dir, { sm: [], audio: [], bg: [] });
    }
    const entry = dirs.get(dir)!;
    if (/\.(sm|ssc)$/i.test(file.name)) {
      entry.sm.push({ file, relPath });
    } else if (isAudioName(file.name)) {
      entry.audio.push(file);
    } else if (isImageName(file.name)) {
      entry.bg.push(file);
    }
  }

  return dirs;
}

/** Pick a song's chart file, preferring .ssc over .sm when it ships both. */
function pickMainChart(
  charts: { file: File; relPath: string }[],
): { file: File; relPath: string } {
  return charts.find((c) => /\.ssc$/i.test(c.file.name)) ?? charts[0];
}

function resolveAudio(
  parsed: ParsedSm,
  audioFiles: File[],
): Record<string, Blob> {
  const blobs: Record<string, Blob> = {};
  const ref = parsed.audioFilename?.toLowerCase();
  let matched: File | null = null;

  if (ref) {
    matched =
      audioFiles.find((f) => f.name.toLowerCase() === ref) ??
      audioFiles.find(
        (f) => f.name.replace(/\.[^.]+$/, "").toLowerCase() === ref.replace(/\.[^.]+$/, ""),
      ) ??
      null;
  }

  if (!matched && audioFiles.length > 0) {
    matched = audioFiles[0];
  }

  if (matched) {
    const displayName = parsed.audioFilename ?? matched.name;
    blobs[displayName] = matched;
  }

  return blobs;
}

function resolveBackground(
  parsed: ParsedSm,
  bgFiles: File[],
): Record<string, Blob> {
  const blobs: Record<string, Blob> = {};
  const ref = parsed.backgroundFilename?.toLowerCase();
  let matched: File | null = null;

  if (ref) {
    matched =
      bgFiles.find((f) => f.name.toLowerCase() === ref) ??
      bgFiles.find(
        (f) => f.name.replace(/\.[^.]+$/, "").toLowerCase() === ref.replace(/\.[^.]+$/, ""),
      ) ??
      null;
  }

  if (!matched && bgFiles.length > 0) {
    const sorted = [...bgFiles].sort((a, b) => a.name.localeCompare(b.name));
    matched =
      sorted.find((f) => /^bg|back/i.test(f.name)) ??
      sorted.find((f) => /banner/i.test(f.name)) ??
      sorted[0];
  }

  if (matched) {
    const displayName = parsed.backgroundFilename ?? matched.name;
    blobs[displayName] = matched;
  }

  return blobs;
}

export async function scanPackFromPicker(
  dirHandle: FileSystemDirectoryHandle,
): Promise<PackSong[]> {
  const all: { file: File; relPath: string }[] = [];

  async function walk(handle: FileSystemDirectoryHandle, path: string) {
    const iter = (handle as unknown as {
      values(): AsyncIterableIterator<FileSystemHandle>;
    }).values();
    for await (const entry of iter) {
      const entryPath = path ? `${path}/${entry.name}` : entry.name;
      if (entry.kind === "file") {
        const file = await (entry as FileSystemFileHandle).getFile();
        all.push({ file, relPath: entryPath });
      } else if (entry.kind === "directory") {
        await walk(entry as FileSystemDirectoryHandle, entryPath);
      }
    }
  }

  await walk(dirHandle, "");

  const dirs = groupFilesByDir(all);
  const songs: PackSong[] = [];

  for (const [dirName, files] of dirs) {
    if (files.sm.length === 0) continue;

    const mainSm = pickMainChart(files.sm);
    const text = await mainSm.file.text();
    const parsed = parseSmFile(text);

    const audioBlobs = resolveAudio(parsed, files.audio);
    const bgBlobs = resolveBackground(parsed, files.bg);

    const diffInfo = parsed.difficulties.map((d) => ({
      name: d.name,
      keys: d.keyCount,
    }));

    songs.push({
      info: {
        title: parsed.meta.title,
        artist: parsed.meta.artist,
        creator: parsed.meta.creator,
        dirName,
        sourceSmName: mainSm.file.name,
        audioFilename: parsed.audioFilename,
        backgroundFilename: parsed.backgroundFilename,
        difficulties: diffInfo,
      },
      parsed,
      audioBlobs,
      bgBlobs,
    });
  }

  return songs;
}

export async function scanPackFromDrop(
  entries: DataTransferItemList,
): Promise<PackSong[]> {
  const all: { file: File; relPath: string }[] = [];

  const readEntry = (entry: FileSystemEntry, path: string): Promise<void> => {
    return new Promise((resolve) => {
      if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        fileEntry.file(
          (file) => {
            all.push({ file, relPath: path ? `${path}/${file.name}` : file.name });
            resolve();
          },
          () => resolve(),
        );
      } else if (entry.isDirectory) {
        const dirReader = (entry as FileSystemDirectoryEntry).createReader();
        const readBatch = () => {
          dirReader.readEntries(
            (entries) => {
              if (entries.length === 0) {
                resolve();
              } else {
                void Promise.all(
                  entries.map((e) => readEntry(e, path ? `${path}/${entry.name}` : entry.name)),
                ).then(() => readBatch());
              }
            },
            () => resolve(),
          );
        };
        readBatch();
      } else {
        resolve();
      }
    });
  };

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i].webkitGetAsEntry();
    if (entry) await readEntry(entry, "");
  }

  const dirs = groupFilesByDir(all);
  const songs: PackSong[] = [];

  for (const [dirName, files] of dirs) {
    if (files.sm.length === 0) continue;

    const mainSm = pickMainChart(files.sm);
    const text = await mainSm.file.text();
    const parsed = parseSmFile(text);

    const audioBlobs = resolveAudio(parsed, files.audio);
    const bgBlobs = resolveBackground(parsed, files.bg);

    const diffInfo = parsed.difficulties.map((d) => ({
      name: d.name,
      keys: d.keyCount,
    }));

    songs.push({
      info: {
        title: parsed.meta.title,
        artist: parsed.meta.artist,
        creator: parsed.meta.creator,
        dirName,
        sourceSmName: mainSm.file.name,
        audioFilename: parsed.audioFilename,
        backgroundFilename: parsed.backgroundFilename,
        difficulties: diffInfo,
      },
      parsed,
      audioBlobs,
      bgBlobs,
    });
  }

  return songs;
}
