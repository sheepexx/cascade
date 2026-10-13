import { getSupabase } from "./supabase";
import type { MappingStats } from "./mappingStats";
import type { MappingReport } from "./mappingTracker";

/** Someone's mapping statistics, already narrowed to what the caller may see. */
export async function getMappingStats(userId: string): Promise<MappingStats | null> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("get_mapping_stats", { p_user: userId });
  if (error) throw new Error(error.message);
  return (data ?? null) as MappingStats | null;
}

/** Sends one report; the database decides how much of it to credit. */
export async function recordMappingActivity(report: MappingReport): Promise<number> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("record_mapping_activity", {
    p_session: report.session,
    p_entries: report.entries,
    p_from: report.from,
    p_to: report.to,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}

export async function clearMappingActivity(projectKey: string | null = null): Promise<void> {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("clear_mapping_activity", { p_project_key: projectKey });
  if (error) throw new Error(error.message);
}
