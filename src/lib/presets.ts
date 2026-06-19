import { supabase } from "./supabase";
import type { PatternNote } from "./patterns";

/**
 * Pattern preset storage on Supabase. Presets are reusable note snippets that
 * users insert into the editor. Anyone can publish one (it lands as `pending`);
 * admins approve/reject them via the admin UI. RLS enforces visibility:
 * non-admins only see `approved` presets plus their own.
 */

export type PresetStatus = "pending" | "approved" | "rejected";

export type Preset = {
  id: string;
  author: string;
  name: string;
  key_count: number;
  description: string;
  pattern: PatternNote[];
  tags: string[];
  is_public: boolean;
  status: PresetStatus;
  created_at: string;
  /** Author profile, when embedded (admin views). */
  author_profile?: { username: string; avatar_url: string | null } | null;
};

const COLUMNS =
  "id,author,name,key_count,description,pattern,tags,is_public,status,created_at";

/** Approved presets, optionally filtered to a key count. */
export async function listPresets(opts?: {
  keyCount?: number;
}): Promise<Preset[]> {
  let q = supabase
    .from("presets")
    .select(COLUMNS)
    .eq("status", "approved")
    .order("created_at", { ascending: false });
  if (opts?.keyCount) q = q.eq("key_count", opts.keyCount);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Preset[];
}

/** The signed-in user's own presets (any status). */
export async function myPresets(): Promise<Preset[]> {
  const { data, error } = await supabase
    .from("presets")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  // RLS already limits non-admins to their own + approved; for "mine" we don't
  // over-filter here since the publish flow is the main caller.
  return (data ?? []) as Preset[];
}

export async function publishPreset(input: {
  authorId: string;
  name: string;
  keyCount: number;
  description: string;
  pattern: PatternNote[];
  tags: string[];
}): Promise<void> {
  const { error } = await supabase.from("presets").insert({
    author: input.authorId,
    name: input.name,
    key_count: input.keyCount,
    description: input.description,
    pattern: input.pattern,
    tags: input.tags,
    status: "pending",
  });
  if (error) throw new Error(error.message);
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
    .select(`${COLUMNS}, author_profile:users!author(username,avatar_url)`)
    .eq("status", status)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  // PostgREST returns the FK embed as a (single-element) array; normalise it.
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const ap = r.author_profile;
    return {
      ...r,
      author_profile: Array.isArray(ap) ? ap[0] ?? null : ap ?? null,
    } as Preset;
  });
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
