import { supabase } from "./supabase";
import {
  deleteProjectWithAssets,
  deleteSharedAssets,
  getAdminStorageStats,
  type AdminStorageStats,
} from "./storage";

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
  const [usersResult, previews] = await Promise.all([
    supabase.rpc("admin_user_summaries"),
    listAdminSharedMaps(),
  ]);
  if (usersResult.error) throw new Error(usersResult.error.message);
  const previewBytes = new Map<string, number>();
  for (const preview of previews) {
    previewBytes.set(
      preview.owner,
      (previewBytes.get(preview.owner) ?? 0) + Number(preview.asset_bytes || 0),
    );
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
  const { data, error } = await supabase.rpc("admin_user_events", {
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUserEvent[];
}

export async function adminUserProjects(
  userId: string,
): Promise<AdminUserProject[]> {
  const { data, error } = await supabase.rpc("admin_user_projects", {
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUserProject[];
}

export async function listAdminSharedMaps(
  userId: string | null = null,
): Promise<AdminSharedMap[]> {
  const { data, error } = await supabase.rpc("admin_shared_map_summaries", {
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminSharedMap[];
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
  const { error } = await supabase
    .from("users")
    .update({ is_admin: isAdmin })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listAllProjects(): Promise<AdminProject[]> {
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
  const { data, error } = await supabase.rpc("admin_event_stats");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminEventStat[];
}

export async function adminPlatformStats(): Promise<AdminPlatformStat[]> {
  const { data, error } = await supabase.rpc("admin_platform_stats");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminPlatformStat[];
}

export async function adminAppVersionStats(): Promise<AdminAppVersionStat[]> {
  const { data, error } = await supabase.rpc("admin_app_version_stats");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminAppVersionStat[];
}

export async function adminDesktopDownloads(): Promise<
  AdminDesktopDownloadStat[]
> {
  const { data, error } = await supabase.rpc("admin_desktop_download_stats");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminDesktopDownloadStat[];
}

export async function getAdminStats(): Promise<AdminStats> {
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
