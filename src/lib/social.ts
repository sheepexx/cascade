import { getSupabase } from "./supabase";

/**
 * Profiles, friends, blocks, messages and privacy settings (migration 0041).
 * Everything goes through database functions that apply the other person's
 * privacy settings and blocks, so what comes back is already what the caller
 * may see.
 */

export type PrivacyLevel = "everyone" | "friends" | "nobody";

export type PrivacySettings = {
  friend_requests: "everyone" | "nobody";
  messages: PrivacyLevel;
  online_status: PrivacyLevel;
  activity: PrivacyLevel;
  mapping_stats: PrivacyLevel;
  mapping_time: PrivacyLevel;
  project_time: PrivacyLevel;
  projects: PrivacyLevel;
};

export const DEFAULT_PRIVACY: PrivacySettings = {
  friend_requests: "everyone",
  messages: "friends",
  online_status: "everyone",
  activity: "friends",
  mapping_stats: "friends",
  mapping_time: "friends",
  project_time: "friends",
  projects: "nobody",
};

export type Relationship = "self" | "friends" | "incoming" | "outgoing" | "blocked" | "none";

export type Presence = {
  online: boolean;
  last_seen_at: string | null;
  activity: string | null;
};

export type ProfileCard = {
  id: string;
  osu_id: number;
  username: string;
  avatar_url: string | null;
  country_code: string | null;
  relationship: Relationship;
  presence: Presence | null;
  osu: {
    ranked_count: number;
    loved_count: number;
    pending_count: number;
    graveyard_count: number;
    guest_count: number;
    is_supporter: boolean;
  } | null;
};

export type Visibility = {
  mapping_stats: boolean;
  mapping_time: boolean;
  project_time: boolean;
  projects: boolean;
};

export type Profile = ProfileCard & {
  cascade_joined_at: string;
  is_self: boolean;
  incoming_request_id: string | null;
  friends_since: string | null;
  can_friend_request: boolean;
  can_message: boolean;
  visible: Visibility;
};

export type FriendLists = {
  friends: (ProfileCard & { since: string })[];
  incoming: (ProfileCard & { requested_at: string })[];
  outgoing: (ProfileCard & { requested_at: string })[];
  blocked: (ProfileCard & { blocked_at: string })[];
};

export type Conversation = {
  id: string;
  user: ProfileCard;
  last_message: {
    id: string;
    sender: string;
    body: string;
    created_at: string;
    deleted: boolean;
  } | null;
  unread: number;
  muted: boolean;
  archived: boolean;
  can_send: boolean;
  created_at: string;
};

export type Message = {
  id: string;
  conversation_id: string;
  sender: string;
  body: string;
  reply_to: string | null;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
};

export type SocialCounts = { unread_messages: number; pending_requests: number };

export type ReportReason = "spam" | "harassment" | "inappropriate" | "impersonation" | "other";

export const MESSAGE_MAX_LENGTH = 2000;

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export const getProfile = (name: string) => call<Profile | null>("get_profile", { p_name: name });

export const searchUsers = (query: string, limit = 20, offset = 0) =>
  call<{ users: ProfileCard[]; total: number }>("search_users", {
    p_query: query,
    p_limit: limit,
    p_offset: offset,
  });

export const discoverUsers = (limit = 12) =>
  call<{ recent: ProfileCard[]; featured: ProfileCard[] }>("discover_users", { p_limit: limit });

export const listFriends = () => call<FriendLists>("list_friends");

export const sendFriendRequest = (userId: string) =>
  call<Relationship>("send_friend_request", { p_user: userId });

export const respondFriendRequest = (userId: string, accept: boolean) =>
  call<Relationship>("respond_friend_request", { p_user: userId, p_accept: accept });

export const cancelFriendRequest = (userId: string) =>
  call<void>("cancel_friend_request", { p_user: userId });

export const removeFriend = (userId: string) => call<void>("remove_friend", { p_user: userId });

export const blockUser = (userId: string) => call<void>("block_user", { p_user: userId });

export const unblockUser = (userId: string) => call<void>("unblock_user", { p_user: userId });

export const reportUser = (userId: string, reason: ReportReason, details: string) =>
  call<void>("report_user", { p_user: userId, p_reason: reason, p_details: details || null });

export const getMyPrivacy = () => call<PrivacySettings>("get_my_privacy");

const PRIVACY_EVENT = "cascade:privacy-changed";

export async function setMyPrivacy(patch: Partial<PrivacySettings>): Promise<PrivacySettings> {
  const saved = await call<PrivacySettings>("set_my_privacy", { p_settings: patch });
  window.dispatchEvent(new CustomEvent<PrivacySettings>(PRIVACY_EVENT, { detail: saved }));
  return saved;
}

/** Calls back with the new settings whenever this tab saves them. */
export function onPrivacyChanged(listener: (settings: PrivacySettings) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<PrivacySettings>).detail);
  window.addEventListener(PRIVACY_EVENT, handler);
  return () => window.removeEventListener(PRIVACY_EVENT, handler);
}

export const getSocialCounts = () => call<SocialCounts>("get_social_counts");

export const heartbeat = (activity: string | null) =>
  call<void>("social_heartbeat", { p_activity: activity });

export const goOffline = () => call<void>("social_go_offline");

export const openConversation = (userId: string) =>
  call<string>("open_conversation", { p_user: userId });

export const listConversations = () => call<Conversation[]>("list_conversations");

export const sendMessage = (conversationId: string, body: string, replyTo: string | null) =>
  call<Message>("send_message", {
    p_conversation: conversationId,
    p_body: body,
    p_reply_to: replyTo,
  });

export const editMessage = (messageId: string, body: string) =>
  call<Message>("edit_message", { p_message: messageId, p_body: body });

export const deleteMessage = (messageId: string) =>
  call<void>("delete_message", { p_message: messageId });

export const markConversationRead = (conversationId: string) =>
  call<void>("mark_conversation_read", { p_conversation: conversationId });

export const setConversationState = (
  conversationId: string,
  state: { muted?: boolean; archived?: boolean },
) =>
  call<void>("set_conversation_state", {
    p_conversation: conversationId,
    p_muted: state.muted ?? null,
    p_archived: state.archived ?? null,
  });

const MESSAGE_COLUMNS =
  "id,conversation_id,sender,body,reply_to,created_at,edited_at,deleted_at";

/** A page of a conversation, newest first, before the given time. */
export async function listMessages(
  conversationId: string,
  before: string | null,
  limit = 50,
): Promise<Message[]> {
  const supabase = await getSupabase();
  let query = supabase
    .from("messages")
    .select(MESSAGE_COLUMNS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Message[];
}

export type AdminUserReport = {
  id: string;
  reason: ReportReason;
  details: string | null;
  status: "open" | "resolved";
  created_at: string;
  reporter: string | null;
  reported_id: string;
  reported: string;
  reported_avatar_url: string | null;
};

export const adminListUserReports = (status: "open" | "resolved" | null = "open") =>
  call<AdminUserReport[]>("admin_list_user_reports", { p_status: status });

export const adminResolveUserReport = (id: string) =>
  call<void>("admin_resolve_user_report", { p_report: id });

/**
 * Applies a relationship change to a card the UI already holds, so buttons
 * update at once and the server's answer only has to confirm it.
 */
export function withRelationship<T extends ProfileCard>(card: T, relationship: Relationship): T {
  return { ...card, relationship };
}

/** Unicode regional-indicator flag for an ISO country code, or "" if invalid. */
export function countryFlag(code: string | null | undefined): string {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return "";
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    ...[...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}

/** osu!'s own flag artwork for a country (the same images osu! profiles use). */
export function countryFlagUrl(code: string | null | undefined): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;
  const points = [...code.toUpperCase()]
    .map((c) => (0x1f1e6 + c.charCodeAt(0) - 65).toString(16))
    .join("-");
  return `https://osu.ppy.sh/assets/images/flags/${points}.svg`;
}
