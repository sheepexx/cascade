import { supabase } from "./supabase";

// Admin-controlled kill switches (see migrations/0013). Every path here fails
// OPEN: unknown flags, fetch errors, or a missing table all resolve to
// "enabled" so offline and self-hosted installs are never gated.

export type FeatureFlagKey =
  | "cloud_accounts"
  | "collab"
  | "preset_publishing"
  | "beatmap_import"
  | "sv_tools"
  | "playtest"
  | "desktop_download";

export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  cloud_accounts: true,
  collab: true,
  preset_publishing: true,
  beatmap_import: true,
  sv_tools: true,
  playtest: true,
  desktop_download: false,
};

/** Labels for the admin panel. */
export const FEATURE_FLAG_INFO: { key: FeatureFlagKey; label: string }[] = [
  { key: "cloud_accounts", label: "Accounts & cloud saves" },
  { key: "collab", label: "Collaboration invites" },
  { key: "preset_publishing", label: "Preset publishing" },
  { key: "beatmap_import", label: "osu! beatmap import" },
  { key: "sv_tools", label: "SV editor" },
  { key: "playtest", label: "Playtest mode" },
  { key: "desktop_download", label: "Desktop app download" },
];

const CACHE_KEY = "mania:featureFlags";

export function loadCachedFlags(): FeatureFlags {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return DEFAULT_FEATURE_FLAGS;
    const parsed = JSON.parse(raw) as Partial<FeatureFlags>;
    return { ...DEFAULT_FEATURE_FLAGS, ...parsed };
  } catch {
    return DEFAULT_FEATURE_FLAGS;
  }
}

function saveCachedFlags(flags: FeatureFlags): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(flags));
  } catch {
    // Storage full/blocked - cache is only an optimization.
  }
}

export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  try {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("key,enabled");
    if (error || !data) return loadCachedFlags();
    const flags = { ...DEFAULT_FEATURE_FLAGS };
    for (const row of data) {
      if (row.key in flags) {
        flags[row.key as FeatureFlagKey] = row.enabled !== false;
      }
    }
    saveCachedFlags(flags);
    return flags;
  } catch {
    return loadCachedFlags();
  }
}

export type FeatureFlagRow = {
  key: string;
  enabled: boolean;
  description: string | null;
  updated_at: string;
};

/** Full rows for the admin panel (readable by everyone, but only shown there). */
export async function listFeatureFlags(): Promise<FeatureFlagRow[]> {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key,enabled,description,updated_at")
    .order("key");
  if (error) throw new Error(error.message);
  return (data ?? []) as FeatureFlagRow[];
}

export async function setFeatureFlag(
  key: FeatureFlagKey | string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("set_feature_flag", {
    p_key: key,
    p_enabled: enabled,
  });
  if (error) throw new Error(error.message);
}
