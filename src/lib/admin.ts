import { supabase } from "./supabase";

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

export async function listAllUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase
    .from("users")
    .select("id,osu_id,username,avatar_url,is_admin,created_at,last_signed_in_at")
    .order("last_signed_in_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUser[];
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
  const { error } = await supabase.from("projects").delete().eq("id", id);
  if (error) throw new Error(error.message);
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
