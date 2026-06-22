import { supabase } from "./supabase";
import { patternHash, type PatternNote } from "./patterns";

/**
 * Pattern preset storage on Supabase. Presets are reusable note snippets that
 * users insert into the editor. Anyone can publish one (it lands as `pending`);
 * admins approve/reject them via the admin UI. RLS enforces visibility:
 * non-admins only see `approved` presets plus their own.
 *
 * Author display (username + osu_id) is denormalised onto each row so the
 * browser can show who submitted it and link to their osu! profile without
 * reading the users table (RLS blocks reading other users' rows).
 */

export type PresetStatus = "pending" | "approved" | "rejected";

export type Preset = {
  id: string;
  author: string;
  author_username: string | null;
  author_osu_id: number | null;
  name: string;
  key_count: number;
  description: string;
  pattern: PatternNote[];
  tags: string[];
  is_public: boolean;
  status: PresetStatus;
  created_at: string;
};

/** Raised when a pattern identical to an existing live preset is submitted. */
export class DuplicatePresetError extends Error {
  constructor() {
    super("This exact pattern has already been submitted.");
    this.name = "DuplicatePresetError";
  }
}

const COLUMNS =
  "id,author,author_username,author_osu_id,name,key_count,description," +
  "pattern,tags,is_public,status,created_at";

/** Approved presets, optionally filtered to a key count. */
export async function listPresets(opts?: {
  keyCount?: number;
  ownerId?: string | null;
}): Promise<Preset[]> {
  let q = supabase
    .from("presets")
    .select(COLUMNS)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  q = opts?.ownerId
    ? q.or(`is_public.eq.true,author.eq.${opts.ownerId}`)
    : q.eq("is_public", true);
  if (opts?.keyCount) q = q.eq("key_count", opts.keyCount);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Preset[];
}

export async function publishPreset(input: {
  authorId: string;
  authorUsername: string;
  authorOsuId: number;
  name: string;
  keyCount: number;
  description: string;
  pattern: PatternNote[];
  tags: string[];
}): Promise<void> {
  await insertPreset({ ...input, isPublic: true, status: "pending" });
}

export async function savePrivatePreset(input: {
  authorId: string;
  authorUsername: string;
  authorOsuId: number;
  name: string;
  keyCount: number;
  description: string;
  pattern: PatternNote[];
  tags: string[];
}): Promise<void> {
  await insertPreset({ ...input, isPublic: false, status: "approved" });
}

async function insertPreset(input: {
  authorId: string;
  authorUsername: string;
  authorOsuId: number;
  name: string;
  keyCount: number;
  description: string;
  pattern: PatternNote[];
  tags: string[];
  isPublic: boolean;
  status: PresetStatus;
}): Promise<void> {
  const hash = await patternHash(input.pattern, input.keyCount);
  const { error } = await supabase.from("presets").insert({
    author: input.authorId,
    author_username: input.authorUsername,
    author_osu_id: input.authorOsuId,
    name: input.name,
    key_count: input.keyCount,
    description: input.description,
    pattern: input.pattern,
    tags: input.tags,
    pattern_hash: hash,
    is_public: input.isPublic,
    status: input.status,
  });
  if (error) {
    // 23505 = unique_violation on presets_pattern_hash_uniq → duplicate pattern.
    if (error.code === "23505") throw new DuplicatePresetError();
    throw new Error(error.message);
  }
}

export async function deletePreset(id: string): Promise<void> {
  const { error } = await supabase.from("presets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ---- Admin -----------------------------------------------------------------

/** Every preset with the given status (admin only, enforced by RLS). */
export async function listPresetsByStatus(
  status: PresetStatus,
): Promise<Preset[]> {
  const { data, error } = await supabase
    .from("presets")
    .select(COLUMNS)
    .eq("is_public", true)
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Preset[];
}

/** Private account presets saved by users (admin only, enforced by RLS). */
export async function listPrivatePresets(): Promise<Preset[]> {
  const { data, error } = await supabase
    .from("presets")
    .select(COLUMNS)
    .eq("is_public", false)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Preset[];
}

export async function setPresetStatus(
  id: string,
  status: PresetStatus,
): Promise<void> {
  const { error } = await supabase
    .from("presets")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}
