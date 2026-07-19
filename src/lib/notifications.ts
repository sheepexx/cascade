import { supabase } from "./supabase";

export type NotificationKind = "invite" | "app_update" | "system";

export type InboxNotification = {
  id: string;
  recipient: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  project_id: string | null;
  actor: string | null;
  actor_username: string | null;
  actor_avatar_url: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
};

const NOTIFICATION_COLUMNS = [
  "id",
  "recipient",
  "kind",
  "title",
  "body",
  "project_id",
  "actor",
  "actor_username",
  "actor_avatar_url",
  "action_url",
  "read_at",
  "created_at",
].join(",");

export async function listNotifications(
  limit = 50,
): Promise<InboxNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(NOTIFICATION_COLUMNS)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as InboxNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .is("dismissed_at", null);
  if (error) throw new Error(error.message);
}

export async function dismissNotification(id: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: now, dismissed_at: now })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function publishAppUpdate(input: {
  title: string;
  body: string;
  version?: string;
  actionUrl?: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc("publish_app_update", {
    p_title: input.title,
    p_body: input.body,
    p_version: input.version?.trim() || null,
    p_action_url: input.actionUrl?.trim() || null,
  });
  if (error) throw new Error(error.message);
  return Number(data ?? 0);
}
