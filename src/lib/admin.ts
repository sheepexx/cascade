import { getSupabase } from "./supabase";
import {
  deleteMapCard,
  deleteProjectWithAssets,
  deleteSharedAssets,
  getAdminStorageStats,
  type AdminStorageStats,
} from "./storage";
import { mapCardUrl } from "./mapCardCloud";

export type { AdminStorageStats };

export type AdminUser = {
  id: string;
  osu_id: number;
  username: string;
  avatar_url: string | null;
  is_admin: boolean;
  created_at: string;
  last_signed_in_at: string | null;
};

export type AdminProject = {
  id: string;
  owner: string;
  owner_username: string | null;
  owner_osu_id: number | null;
  title: string;
  artist: string;
  creator: string;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  participant_count: number;
  asset_count: number;
  asset_bytes: number;
};

export type AdminStats = {
  users: number;
  exportOsu: number;
  exportOsz: number;
  localProjectsCreated: number;
  browsers: { browser: string; count: number }[];
};

export type AdminPlatform = "web" | "desktop" | "both" | "unknown";

export type AdminUserSummary = AdminUser & {
  event_count: number;
  events_7d: number;
  events_30d: number;
  last_event_at: string | null;
  export_count: number;
  project_count: number;
  storage_bytes: number;
  preset_count: number;
  comment_count: number;
  collab_count: number;
  feedback_count: number;
  last_browser: string | null;
  last_os: string | null;
  desktop_events: number;
  web_events: number;
  last_platform: string | null;
  last_app_version: string | null;
  desktop_version: string | null;
  last_desktop_at: string | null;
};

export type AdminPlatformStat = {
  platform: string;
  users: number;
  users_30d: number;
  events: number;
  events_7d: number;
  events_30d: number;
  last_at: string | null;
};

export type AdminAppVersionStat = {
  platform: string;
  app_version: string;
  users: number;
  events: number;
  events_30d: number;
  last_at: string | null;
};

export type AdminDesktopDownloadStat = {
  version: string;
  asset: string;
  last_7d: number;
  last_30d: number;
  total: number;
  last_at: string | null;
};

export function userPlatform(user: AdminUserSummary): AdminPlatform {
  const desktop = Number(user.desktop_events) > 0;
  const web = Number(user.web_events) > 0;
  if (desktop && web) return "both";
  if (desktop) return "desktop";
  if (web) return "web";
  return "unknown";
}

const PLATFORM_ORDER: Record<AdminPlatform, number> = {
  desktop: 3,
  both: 2,
  web: 1,
  unknown: 0,
};

export function platformRank(user: AdminUserSummary): number {
  return PLATFORM_ORDER[userPlatform(user)];
}

export type AdminUserEvent = {
  event_type: string;
  last_7d: number;
  last_30d: number;
  total: number;
  last_at: string | null;
};

export type AdminUserProject = {
  id: string;
  title: string;
  artist: string;
  created_at: string;
  updated_at: string;
  asset_count: number;
  asset_bytes: number;
  role: string;
};

export type AdminSharedMap = {
  id: string;
  slug: string;
  project_id: string | null;
  owner: string;
  owner_username: string | null;
  owner_osu_id: number | null;
  title: string;
  artist: string;
  views: number;
  last_viewed_at: string | null;
  asset_count: number;
  asset_bytes: number;
  created_at: string;
  updated_at: string;
};

export async function listUserSummaries(): Promise<AdminUserSummary[]> {
  const supabase = await getSupabase();
  const [usersResult, previews, cards] = await Promise.all([
    supabase.rpc("admin_user_summaries"),
    listAdminSharedMaps(),
    listAdminMapCards().catch((): AdminMapCard[] => []),
  ]);
  if (usersResult.error) throw new Error(usersResult.error.message);
  const previewBytes = new Map<string, number>();
  for (const preview of previews) {
    previewBytes.set(
      preview.owner,
      (previewBytes.get(preview.owner) ?? 0) + Number(preview.asset_bytes || 0),
    );
  }
  for (const card of cards) {
    previewBytes.set(card.owner, (previewBytes.get(card.owner) ?? 0) + card.bytes);
  }
  return ((usersResult.data ?? []) as AdminUserSummary[]).map((user) => ({
    ...user,
    storage_bytes:
      Number(user.storage_bytes || 0) + (previewBytes.get(user.id) ?? 0),
  }));
}

export async function adminUserEvents(
  userId: string,
): Promise<AdminUserEvent[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("admin_user_events", {
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUserEvent[];
}

export async function adminUserProjects(
  userId: string,
): Promise<AdminUserProject[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("admin_user_projects", {
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUserProject[];
}

export async function listAdminSharedMaps(
  userId: string | null = null,
): Promise<AdminSharedMap[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("admin_shared_map_summaries", {
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminSharedMap[];
}

export type AdminMapCard = {
  id: string;
  slug: string;
  map_key: string;
  owner: string;
  owner_username: string | null;
  owner_osu_id: number | null;
  url: string;
  bytes: number;
  width: number;
  height: number;
  version: number;
  created_at: string;
  updated_at: string;
};

type AdminMapCardRow = Omit<AdminMapCard, "owner" | "owner_username" | "owner_osu_id" | "url"> & {
  user_id: string;
  users: { username: string | null; osu_id: number | null } | null;
};

export async function listAdminMapCards(
  userId: string | null = null,
): Promise<AdminMapCard[]> {
  const supabase = await getSupabase();
  let query = supabase
    .from("map_cards")
    .select(
      "id,slug,map_key,user_id,bytes,width,height,version,created_at,updated_at,users(username,osu_id)",
    )
    .order("updated_at", { ascending: false });
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as AdminMapCardRow[]).map(({ users, user_id, ...row }) => ({
    ...row,
    owner: user_id,
    owner_username: users?.username ?? null,
    owner_osu_id: users?.osu_id ?? null,
    url: mapCardUrl(row.slug),
    bytes: Number(row.bytes),
  }));
}

export async function deleteMapCardAdmin(card: Pick<AdminMapCard, "slug">): Promise<void> {
  await deleteMapCard(card.slug);
}

export async function deleteSharedMapAdmin(
  preview: Pick<AdminSharedMap, "id" | "owner" | "slug">,
): Promise<void> {
  await deleteSharedAssets(preview.slug);
}

export async function setUserAdmin(
  id: string,
  isAdmin: boolean,
): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("users")
    .update({ is_admin: isAdmin })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listAllProjects(): Promise<AdminProject[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("admin_project_summaries");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminProject[];
}

export async function deleteProjectAdmin(id: string): Promise<void> {
  await deleteProjectWithAssets(id);
}

export type AdminEventStat = {
  event_type: string;
  last_7d: number;
  last_30d: number;
  total: number;
};

export async function adminEventStats(): Promise<AdminEventStat[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("admin_event_stats");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminEventStat[];
}

export type AdminRetentionRow = {
  cohort_week: string;
  installs: number;
  d1: number;
  d7: number;
  d30: number;
  mature_d1: boolean;
  mature_d7: boolean;
  mature_d30: boolean;
};

export type AdminFunnel = { opened: number; created: number; edited: number; exported: number };
export type AdminWeeklyMappers = { week_start: string; mappers: number };
export type AdminDiscordClicks = { source: string; clicks: number };

/** Usage milestones (migration 0037): retention, funnel, mappers, Discord. */
export async function adminUsageStats(): Promise<{
  retention: AdminRetentionRow[];
  funnel: AdminFunnel | null;
  mappers: AdminWeeklyMappers[];
  discord: AdminDiscordClicks[];
}> {
  const supabase = await getSupabase();
  const [retention, funnel, mappers, discord] = await Promise.all([
    supabase.rpc("admin_retention_stats", { p_weeks: 12 }),
    supabase.rpc("admin_funnel_stats", { p_days: 30 }),
    supabase.rpc("admin_weekly_mappers", { p_weeks: 12 }),
    supabase.rpc("admin_discord_clicks", { p_days: 30 }),
  ]);
  const failed = [retention, funnel, mappers, discord].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    retention: (retention.data ?? []) as AdminRetentionRow[],
    funnel: ((funnel.data ?? []) as AdminFunnel[])[0] ?? null,
    mappers: (mappers.data ?? []) as AdminWeeklyMappers[],
    discord: (discord.data ?? []) as AdminDiscordClicks[],
  };
}

export async function adminPlatformStats(): Promise<AdminPlatformStat[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("admin_platform_stats");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminPlatformStat[];
}

export async function adminAppVersionStats(): Promise<AdminAppVersionStat[]> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("admin_app_version_stats");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminAppVersionStat[];
}

export async function adminDesktopDownloads(): Promise<
  AdminDesktopDownloadStat[]
> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("admin_desktop_download_stats");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminDesktopDownloadStat[];
}

export async function getAdminStats(): Promise<AdminStats> {
  const supabase = await getSupabase();
  const [
    usersResult,
    exportOsuResult,
    exportOszResult,
    localProjectsResult,
    browserResult,
  ] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "export_osu"),
    supabase
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "export_osz"),
    supabase
      .from("analytics_events")
      .select("id", { count: "exact", head: true })
      .eq("event_type", "local_project_created"),
    supabase.from("analytics_events").select("browser"),
  ]);

  for (const result of [
    usersResult,
    exportOsuResult,
    exportOszResult,
    localProjectsResult,
    browserResult,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const browserCounts = new Map<string, number>();
  for (const row of browserResult.data ?? []) {
    const browser = String(row.browser || "Unknown");
    browserCounts.set(browser, (browserCounts.get(browser) ?? 0) + 1);
  }

  return {
    users: usersResult.count ?? 0,
    exportOsu: exportOsuResult.count ?? 0,
    exportOsz: exportOszResult.count ?? 0,
    localProjectsCreated: localProjectsResult.count ?? 0,
    browsers: [...browserCounts.entries()]
      .map(([browser, count]) => ({ browser, count }))
      .sort((a, b) => b.count - a.count || a.browser.localeCompare(b.browser)),
  };
}

export async function getStorageStats(): Promise<AdminStorageStats> {
  return getAdminStorageStats();
}
