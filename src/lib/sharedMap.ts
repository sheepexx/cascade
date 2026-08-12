import { supabase } from "./supabase";
import { computeMapStats } from "./mapStats";
import { computeStarRating } from "./starRating";
import { activeTimingAt } from "./timing";
import type { Difficulty, SongMeta, TimingPoint } from "../types";

export const SHARED_BUCKET = "shared";
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

export type PublishParams = {
  ownerId: string;
  projectId: string | null;
  data: SharedMapData;
  audio: { name: string; blob: Blob } | null;
  background: { name: string; blob: Blob } | null;
  card: Blob | null;
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

export async function publishSharedMap(params: PublishParams): Promise<string> {
  const { ownerId, projectId, data, audio, background, card } = params;
  const bytes = (audio?.blob.size ?? 0) + (background?.blob.size ?? 0);
  if (bytes > SHARED_BYTE_LIMIT) {
    throw new Error(
      `Shared assets are ${(bytes / 1048576).toFixed(0)} MB, over the ` +
        `${SHARED_BYTE_LIMIT / 1048576} MB limit.`,
    );
  }

  const slug = makeSlug();
  const base = `${ownerId}/${slug}`;
  const audioPath = audio
    ? await upload(`${base}/audio.${extensionOf(audio.name, "mp3")}`, audio.blob)
    : null;
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
      "slug,owner,title,artist,creator,data,audio_path,bg_path,card_path,key_counts,star_rating,length_ms,bpm,note_count,views,created_at",
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
      "slug,owner,title,artist,creator,data,audio_path,bg_path,card_path,key_counts,star_rating,length_ms,bpm,note_count,views,created_at",
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
