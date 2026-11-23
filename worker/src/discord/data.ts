import { SignJWT } from "jose";
import type { WorkerEnv } from "../storage";
import { rpc } from "../auth";

/**
 * How the bot reads Cascade. Profiles, statistics and the roadmap go through
 * the website's own public functions with an anonymous token, so the bot sees
 * exactly what a signed-out visitor sees and privacy settings are applied by
 * the database. Only the bot's own functions (migration 0048) use the
 * service role, and none of them return private data.
 */

let anon: { secret: string; token: string; expires: number } | null = null;

async function anonToken(env: WorkerEnv): Promise<string> {
  if (anon && anon.secret === env.SUPABASE_JWT_SECRET && anon.expires > Date.now() + 60_000) return anon.token;
  const token = await new SignJWT({ role: "anon" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET));
  anon = { secret: env.SUPABASE_JWT_SECRET, token, expires: Date.now() + 10 * 60_000 };
  return token;
}

/** A public function, called as a signed-out visitor. */
export async function publicRpc<T>(env: WorkerEnv, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${await anonToken(env)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${fn} failed (${res.status})`);
  return (await res.json()) as T;
}

/** One of the bot's own functions. */
export async function serviceRpc<T>(env: WorkerEnv, fn: string, args: Record<string, unknown>): Promise<T> {
  const result = await rpc<T>(env, fn, args);
  if (!result.ok) throw new Error(`${fn} failed (${result.status})`);
  return result.data;
}

export type DiscordAccount = {
  user_id: string;
  username: string;
  handle: string;
  is_admin: boolean;
  discord_lookup: "everyone" | "nobody";
  leaderboard: "everyone" | "nobody";
};

export type PublicProfile = {
  id: string;
  username: string;
  handle?: string;
  avatar_url: string | null;
  osu_id: number | null;
  is_admin?: boolean;
  is_contributor?: boolean;
  country_code: string | null;
  cascade_joined_at: string;
  visible: { mapping_stats: boolean; mapping_time: boolean; project_time: boolean; projects: boolean };
  osu: { ranked_count: number; loved_count: number; pending_count: number; graveyard_count: number; guest_count: number } | null;
};

export type PublicStats = {
  visible: { mapping_stats: boolean; mapping_time: boolean };
  counters: {
    notes_placed: number;
    notes_deleted: number;
    timing_changes: number;
    sv_changes: number;
    playtests: number;
    exports: number;
    maps_created: number;
    difficulties_created: number;
    active_days: number;
    maps_edited: number;
    first_day: string | null;
  } | null;
  totals: { edit: number; playtest: number; review: number; longest_session: number } | null;
};

export type ContributorStatus = {
  points: number;
  accepted: number;
  pending: number;
  threshold: number;
  override: "grant" | "deny" | null;
  contributor: boolean;
  recent: { number: number; kind: string; title: string; points: number; reviewed_at: string | null }[];
};

export type Contribution = {
  id: string;
  number: number;
  kind: "bug" | "suggestion" | "other";
  title: string;
  body: string;
  status: "pending" | "accepted" | "rejected";
  points: number;
  discord_user_id: string | null;
  discord_username: string | null;
  linked: boolean;
  source: "discord" | "admin";
  review_channel_id: string | null;
  review_message_id: string | null;
  reviewed_by_discord: string | null;
  review_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export type ReviewResult = {
  result: "reviewed" | "already_reviewed" | "not_found" | "own_submission" | "awarded";
  contribution?: Contribution;
  status?: ContributorStatus;
};

export type ContributionSettings = {
  bug_points: number;
  suggestion_points: number;
  role_threshold: number;
  hourly_limit: number;
  daily_limit: number;
};

export type RoadmapItem = { id: number; title: string; details: string; status: "planned" | "in_progress" | "done"; updated_at: string };

export type AppUpdate = { title: string; body: string | null; action_url: string | null; version: string | null; created_at: string };

export type LeaderRow = { username: string; handle: string; value: number };

export const data = {
  discordAccount: (env: WorkerEnv, discordUserId: string) =>
    serviceRpc<DiscordAccount | null>(env, "discord_account", { p_discord_user_id: discordUserId }),
  profile: (env: WorkerEnv, name: string) => publicRpc<PublicProfile | null>(env, "get_profile", { p_name: name }),
  stats: (env: WorkerEnv, userId: string) => publicRpc<PublicStats | null>(env, "get_mapping_stats", { p_user: userId }),
  contributor: (env: WorkerEnv, userId: string | null, discordUserId: string | null) =>
    serviceRpc<ContributorStatus>(env, "contributor_status", { p_user: userId, p_discord_user_id: discordUserId }),
  submit: (env: WorkerEnv, kind: "bug" | "suggestion", title: string, body: string, discordUserId: string, discordUsername: string) =>
    serviceRpc<{ id?: string; number?: number; linked?: boolean; error?: string }>(env, "submit_contribution", {
      p_kind: kind,
      p_title: title,
      p_body: body,
      p_discord_user_id: discordUserId,
      p_discord_username: discordUsername,
    }),
  setReviewMessage: (env: WorkerEnv, id: string, channelId: string, messageId: string) =>
    serviceRpc<null>(env, "set_contribution_review_message", {
      p_id: id,
      p_channel_id: channelId,
      p_message_id: messageId,
    }),
  review: (env: WorkerEnv, number: number, accept: boolean, reviewer: string, points: number | null, note: string | null) =>
    serviceRpc<ReviewResult>(env, "review_contribution", {
      p_number: number,
      p_accept: accept,
      p_reviewer_discord_id: reviewer,
      p_points: points,
      p_note: note,
    }),
  award: (env: WorkerEnv, discordUserId: string, title: string, points: number, reviewer: string) =>
    serviceRpc<ReviewResult>(env, "award_contribution", {
      p_discord_user_id: discordUserId,
      p_title: title,
      p_points: points,
      p_reviewer_discord_id: reviewer,
    }),
  override: (env: WorkerEnv, discordUserId: string, mode: "grant" | "deny" | "auto", note: string | null, by: string) =>
    serviceRpc<ContributorStatus>(env, "set_contributor_override", {
      p_discord_user_id: discordUserId,
      p_mode: mode,
      p_note: note,
      p_set_by_discord: by,
    }),
  settings: (env: WorkerEnv) => serviceRpc<ContributionSettings>(env, "get_contribution_settings", {}),
  setSettings: (env: WorkerEnv, bug: number | null, suggestion: number | null, threshold: number | null) =>
    serviceRpc<ContributionSettings>(env, "set_contribution_settings", {
      p_bug_points: bug,
      p_suggestion_points: suggestion,
      p_role_threshold: threshold,
    }),
  pending: (env: WorkerEnv) => serviceRpc<Contribution[]>(env, "pending_contributions", { p_limit: 5 }),
  leaderboard: (env: WorkerEnv, metric: string) =>
    serviceRpc<LeaderRow[]>(env, "bot_leaderboard", { p_metric: metric, p_limit: 10 }),
  roadmap: (env: WorkerEnv) => publicRpc<RoadmapItem[]>(env, "roadmap_list", {}),
  saveRoadmap: (env: WorkerEnv, id: number | null, title: string | null, details: string | null, status: string | null) =>
    serviceRpc<RoadmapItem | null>(env, "roadmap_save", { p_id: id, p_title: title, p_details: details, p_status: status }),
  removeRoadmap: (env: WorkerEnv, id: number) => serviceRpc<boolean>(env, "roadmap_remove", { p_id: id }),
  updates: (env: WorkerEnv) => serviceRpc<AppUpdate[]>(env, "recent_app_updates", { p_limit: 5 }),
  identityOwner: (env: WorkerEnv, discordUserId: string) =>
    serviceRpc<string | null>(env, "identity_owner", { p_provider: "discord", p_provider_user_id: discordUserId }),
};

export type BotData = typeof data;
