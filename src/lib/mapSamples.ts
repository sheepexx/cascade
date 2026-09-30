/**
 * A mapset's own hitsound samples: the .wav/.ogg/.mp3 files an .osz carries
 * beside the song. osu! plays them instead of the skin's for notes on a custom
 * sample index, and a note can name one file to play in place of its normal
 * sound.
 */
export type SampleFile = { name: string; blob: Blob };

/** Hitsound names osu! looks up in a beatmap folder, with the optional custom index. */
const HITSOUND_NAME = /^(normal|soft|drum)-(hit(normal|whistle|finish|clap)|slider(slide|whistle|tick))(\d*)\.(wav|ogg|mp3)$/i;
const SAMPLE_EXTENSIONS = ["wav", "ogg", "mp3"] as const;

export const MAX_SAMPLE_BYTES = 4 * 1024 * 1024;
export const MAX_SAMPLE_COUNT = 256;
export const MAX_SAMPLE_TOTAL_BYTES = 24 * 1024 * 1024;

/** How a sample is looked up: case-insensitive, forward slashes, no leading "./". */
export function sampleKey(name: string): string {
  return name.replace(/\\/g, "/").replace(/^(\.\/)+/, "").toLowerCase();
}

function baseName(path: string): string {
  return path.replace(/\\/g, "/").split("/").pop() ?? path;
}

export function isHitsoundSampleName(name: string): boolean {
  return HITSOUND_NAME.test(baseName(name));
}

export function mimeForSample(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "ogg") return "audio/ogg";
  if (ext === "mp3") return "audio/mpeg";
  return "audio/wav";
}

/**
 * Picks which archive files are samples: a hitsound-named file, or any audio
 * file a note names, never the song itself, within the size and count caps.
 * Only the top level of the set counts, which is where osu! looks and what
 * every place a project is stored can hold. Returns the paths to keep.
 */
export function chooseSamplePaths(
  entries: { path: string; bytes: number }[],
  referenced: Iterable<string>,
  songAudio: Iterable<string>,
): string[] {
  const wanted = new Set([...referenced].map(sampleKey));
  const songs = new Set([...songAudio].map(sampleKey));
  const kept: string[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const { path, bytes } of entries) {
    const key = sampleKey(path);
    const ext = key.split(".").pop() ?? "";
    if (!(SAMPLE_EXTENSIONS as readonly string[]).includes(ext)) continue;
    if (songs.has(key) || songs.has(sampleKey(baseName(path)))) continue;
    if (key.includes("/") || seen.has(key)) continue;
    if (!wanted.has(key) && !isHitsoundSampleName(key)) continue;
    if (bytes > MAX_SAMPLE_BYTES || total + bytes > MAX_SAMPLE_TOTAL_BYTES) continue;
    if (kept.length >= MAX_SAMPLE_COUNT) break;
    kept.push(path);
    seen.add(key);
    total += bytes;
  }
  return kept;
}

export type SampleIndex = Map<string, SampleFile>;

export function indexSamples(samples: Record<string, SampleFile> | null | undefined): SampleIndex {
  const index: SampleIndex = new Map();
  for (const file of Object.values(samples ?? {})) index.set(sampleKey(file.name), file);
  return index;
}

/**
 * The map's own file for a hitsound like "soft-hitclap" on a custom sample
 * index: none on index 0, the unnumbered file on 1, "soft-hitclap2" on 2 and
 * so on, in any of the formats osu! reads.
 */
export function mapSampleFor(index: SampleIndex, base: string, sampleIndex: number): SampleFile | null {
  if (!index.size || !(sampleIndex >= 1)) return null;
  const name = sampleIndex > 1 ? `${base}${sampleIndex}` : base;
  for (const ext of SAMPLE_EXTENSIONS) {
    const hit = index.get(`${name}.${ext}`.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/** The file a note names to play in place of its normal sound. */
export function namedSampleFor(index: SampleIndex, sampleFile: string | undefined): SampleFile | null {
  if (!sampleFile || !index.size) return null;
  return index.get(sampleKey(sampleFile)) ?? null;
}
