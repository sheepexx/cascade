import { supabase } from "./supabase";
import { decodeAudioBlob, renderTrimmedAudio } from "./audioTrim";
import { loadMp3Encoder } from "./lameEncoder";
import { computeMapStats } from "./mapStats";
import { computeStarRating } from "./starRating";
import { activeTimingAt } from "./timing";
import type { Difficulty, ManiaNote, SongMeta, TimingPoint } from "../types";

export const SHARED_BUCKET = "shared";
export const PREVIEW_CLIP_MS = 10000;
const PREVIEW_FADE_MS = 400;
const PREVIEW_CLIP_NAME = "preview.mp3";
const SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyz23456789";
const SLUG_LENGTH = 10;
const SHARED_BYTE_LIMIT = 60 * 1024 * 1024;

export type SharedMapData = {
  meta: SongMeta;
  timingPoints: TimingPoint[];
  difficulties: Difficulty[];
};

export type SharedMap = {
  slug: string;
  owner: string;
  title: string;
  artist: string;
  creator: string;
  data: SharedMapData;
  audioUrl: string | null;
  audioUrls: Record<string, string>;
  previewUrl: string | null;
  backgroundUrl: string | null;
  cardUrl: string | null;
  keyCounts: number[];
  starRating: number | null;
  lengthMs: number | null;
  bpm: number | null;
  noteCount: number;
  views: number;
  createdAt: string;
};

type SharedRow = {
  slug: string;
  owner: string;
  title: string;
  artist: string;
  creator: string;
  data: SharedMapData;
  audio_path: string | null;
  audio_paths: Record<string, string> | null;
  bg_path: string | null;
  card_path: string | null;
  key_counts: number[] | null;
  star_rating: number | string | null;
  length_ms: number | null;
  bpm: number | string | null;
  note_count: number | null;
  views: number | null;
  created_at: string;
};

export function makeSlug(): string {
  const bytes = new Uint8Array(SLUG_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return out;
}

export function slugFromPath(pathname: string): string | null {
  const match = /^\/m\/([a-z0-9]{4,32})\/?$/i.exec(pathname);
  return match ? match[1] : null;
}

export function sharedMapUrl(slug: string): string {
  const origin =
    typeof location === "undefined" ? "https://cascade.sheepex.net" : location.origin;
  return `${origin}/m/${slug}`;
}

function publicUrl(path: string | null): string | null {
  if (!path) return null;
  return supabase.storage.from(SHARED_BUCKET).getPublicUrl(path).data.publicUrl;
}

function publicAudioUrls(
  paths: Record<string, string> | null,
): Record<string, string> {
  const urls: Record<string, string> = {};
  for (const [name, path] of Object.entries(paths ?? {})) {
    const url = publicUrl(path);
    if (url) urls[name] = url;
  }
  return urls;
}

export function previewClipUrl(owner: string, slug: string): string | null {
  return publicUrl(`${owner}/${slug}/${PREVIEW_CLIP_NAME}`);
}

function num(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function summarise(data: SharedMapData): {
  keyCounts: number[];
  starRating: number;
  lengthMs: number;
  bpm: number | null;
  noteCount: number;
} {
  const diffs = data.difficulties;
  const keyCounts = [...new Set(diffs.map((d) => d.keyCount))].sort((a, b) => a - b);
  let starRating = 0;
  let lengthMs = 0;
  let noteCount = 0;
  for (const d of diffs) {
    starRating = Math.max(starRating, computeStarRating(d.notes, d.keyCount));
    const stats = computeMapStats(d.notes, d.keyCount);
    lengthMs = Math.max(lengthMs, stats.spanMs);
    noteCount = Math.max(noteCount, stats.notes);
  }
  const points = diffs[0]?.timingPoints.length
    ? diffs[0].timingPoints
    : data.timingPoints;
  const bpm = activeTimingAt(0, points)?.bpm ?? null;
  return { keyCounts, starRating, lengthMs, bpm, noteCount };
}

export function previewStartMs(notes: ManiaNote[], previewTime: number): number {
  if (previewTime > 0) return previewTime;
  const first = notes.reduce(
    (min, n) => (n.startTime < min ? n.startTime : min),
    Number.POSITIVE_INFINITY,
  );
  return Number.isFinite(first) ? Math.max(0, first - 800) : 0;
}

export type PublishParams = {
  ownerId: string;
  projectId: string | null;
  data: SharedMapData;
  audioFiles: { name: string; blob: Blob }[];
  previewAudioName?: string | null;
  background: { name: string; blob: Blob } | null;
  card: Blob | null;
  previewStartMs?: number;
};

function extensionOf(name: string, fallback: string): string {
  const dot = name.lastIndexOf(".");
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return /^[a-z0-9]{1,5}$/.test(ext) ? ext : fallback;
}

async function upload(path: string, blob: Blob): Promise<string> {
  const { error } = await supabase.storage
    .from(SHARED_BUCKET)
    .upload(path, blob, { upsert: true, contentType: blob.type || undefined });
  if (error) throw new Error(error.message);
  return path;
}

export async function makePreviewClip(
  audio: Blob,
  startMs: number,
): Promise<{ blob: Blob; ext: string } | null> {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC({ sampleRate: 44100 });
  try {
    const buffer = await decodeAudioBlob(audio, ctx);
    if (!buffer) return null;
    const durationMs = buffer.duration * 1000;
    const start = Math.max(0, Math.min(startMs, Math.max(0, durationMs - 1000)));
    const encoded = renderTrimmedAudio(buffer, {
      startMs: start,
      endMs: Math.min(durationMs, start + PREVIEW_CLIP_MS),
      fadeInMs: PREVIEW_FADE_MS,
      fadeOutMs: PREVIEW_FADE_MS,
    });
    if (encoded.ext !== "mp3") return null;
    return { blob: encoded.blob, ext: encoded.ext };
  } catch {
    return null;
  } finally {
    void ctx.close().catch(() => {});
  }
}

export async function publishSharedMap(params: PublishParams): Promise<string> {
  const { ownerId, projectId, data, audioFiles, background, card } = params;
  const bytes =
    audioFiles.reduce((sum, audio) => sum + audio.blob.size, 0) +
    (background?.blob.size ?? 0);
  if (bytes > SHARED_BYTE_LIMIT) {
    throw new Error(
      `Shared assets are ${(bytes / 1048576).toFixed(0)} MB, over the ` +
        `${SHARED_BYTE_LIMIT / 1048576} MB limit.`,
    );
  }

  const slug = makeSlug();
  const base = `${ownerId}/${slug}`;
  const audioPaths: Record<string, string> = {};
  for (const [index, audio] of audioFiles.entries()) {
    audioPaths[audio.name] = await upload(
      `${base}/audio-${index}.${extensionOf(audio.name, "mp3")}`,
      audio.blob,
    );
  }
  const previewAudio =
    audioFiles.find((audio) => audio.name === params.previewAudioName) ??
    audioFiles[0] ??
    null;
  const audioPath = previewAudio ? audioPaths[previewAudio.name] : null;
  if (previewAudio) {
    await loadMp3Encoder().catch(() => {});
    const clip = await makePreviewClip(
      previewAudio.blob,
      params.previewStartMs ?? 0,
    );
    if (clip) await upload(`${base}/${PREVIEW_CLIP_NAME}`, clip.blob);
  }
  const bgPath = background
    ? await upload(`${base}/bg.${extensionOf(background.name, "jpg")}`, background.blob)
    : null;
  const cardPath = card ? await upload(`${base}/card.png`, card) : null;

  const summary = summarise(data);
  const { error } = await supabase.from("shared_maps").insert({
    slug,
    project_id: projectId,
    owner: ownerId,
    title: data.meta.title || "Untitled",
    artist: data.meta.artist || "",
    creator: data.meta.creator || "",
    data,
    audio_path: audioPath,
    audio_paths: audioPaths,
    bg_path: bgPath,
    card_path: cardPath,
    key_counts: summary.keyCounts,
    star_rating: Number(summary.starRating.toFixed(2)),
    length_ms: Math.round(summary.lengthMs),
    bpm: summary.bpm == null ? null : Number(summary.bpm.toFixed(2)),
    note_count: summary.noteCount,
  });
  if (error) throw new Error(error.message);
  return slug;
}

export async function loadSharedMap(slug: string): Promise<SharedMap | null> {
  const { data, error } = await supabase
    .from("shared_maps")
    .select(
      "slug,owner,title,artist,creator,data,audio_path,audio_paths,bg_path,card_path,key_counts,star_rating,length_ms,bpm,note_count,views,created_at",
    )
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as SharedRow;
  return {
    slug: row.slug,
    owner: row.owner,
    title: row.title,
    artist: row.artist,
    creator: row.creator,
    data: row.data,
    audioUrl: publicUrl(row.audio_path),
    audioUrls: publicAudioUrls(row.audio_paths),
    previewUrl: previewClipUrl(row.owner, row.slug),
    backgroundUrl: publicUrl(row.bg_path),
    cardUrl: publicUrl(row.card_path),
    keyCounts: row.key_counts ?? [],
    starRating: num(row.star_rating),
    lengthMs: row.length_ms,
    bpm: num(row.bpm),
    noteCount: row.note_count ?? 0,
    views: row.views ?? 0,
    createdAt: row.created_at,
  };
}

export async function listMySharedMaps(ownerId: string): Promise<SharedMap[]> {
  const { data, error } = await supabase
    .from("shared_maps")
    .select(
      "slug,owner,title,artist,creator,data,audio_path,audio_paths,bg_path,card_path,key_counts,star_rating,length_ms,bpm,note_count,views,created_at",
    )
    .eq("owner", ownerId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SharedRow[]).map((row) => ({
    slug: row.slug,
    owner: row.owner,
    title: row.title,
    artist: row.artist,
    creator: row.creator,
    data: row.data,
    audioUrl: publicUrl(row.audio_path),
    audioUrls: publicAudioUrls(row.audio_paths),
    previewUrl: previewClipUrl(row.owner, row.slug),
    backgroundUrl: publicUrl(row.bg_path),
    cardUrl: publicUrl(row.card_path),
    keyCounts: row.key_counts ?? [],
    starRating: num(row.star_rating),
    lengthMs: row.length_ms,
    bpm: num(row.bpm),
    noteCount: row.note_count ?? 0,
    views: row.views ?? 0,
    createdAt: row.created_at,
  }));
}

export async function findSharedMapForProject(
  projectId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("shared_maps")
    .select("slug")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { slug: string } | null)?.slug ?? null;
}

export async function unpublishSharedMap(slug: string): Promise<void> {
  const { error } = await supabase.from("shared_maps").delete().eq("slug", slug);
  if (error) throw new Error(error.message);
}

export async function countSharedView(slug: string): Promise<void> {
  await supabase.rpc("bump_shared_map_view", { p_slug: slug });
}

export async function requestSharedMapAccess(slug: string): Promise<void> {
  const { error } = await supabase.rpc("request_shared_map_access", {
    p_slug: slug,
  });
  if (error) throw new Error(error.message);
}
