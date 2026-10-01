import type { ActivityEntry, ActivityTone } from "./activityLog";
import type { InboxNotification, NotificationKind } from "./notifications";

/**
 * One list for the inbox out of two sources: notifications sent to the
 * account (invites, update notes) and this device's activity log.
 */
export type InboxItem =
  | {
      source: "account";
      key: string;
      id: string;
      kind: NotificationKind;
      title: string;
      body: string | null;
      details: null;
      createdAt: number;
      read: boolean;
      notification: InboxNotification;
    }
  | {
      source: "activity";
      key: string;
      id: string;
      kind: ActivityTone;
      title: string;
      body: string | null;
      details: string | null;
      createdAt: number;
      read: boolean;
    };

export type InboxGroup = "today" | "yesterday" | "week" | "older";

export function mergeInbox(
  notifications: readonly InboxNotification[],
  activity: readonly ActivityEntry[],
): InboxItem[] {
  const items: InboxItem[] = [];
  for (const n of notifications) {
    const createdAt = Date.parse(n.created_at);
    items.push({
      source: "account",
      key: `account:${n.id}`,
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      details: null,
      createdAt: Number.isFinite(createdAt) ? createdAt : 0,
      read: n.read_at !== null,
      notification: n,
    });
  }
  for (const e of activity) {
    items.push({
      source: "activity",
      key: `activity:${e.id}`,
      id: e.id,
      kind: e.tone,
      title: e.title,
      body: e.body ?? null,
      details: e.details ?? null,
      createdAt: e.createdAt,
      read: e.readAt !== null,
    });
  }
  return items.sort((a, b) => b.createdAt - a.createdAt);
}

function startOfDay(at: Date): number {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
}

/** Which heading an item sits under, by calendar day in local time. */
export function inboxGroupOf(createdAt: number, now: Date): InboxGroup {
  const today = startOfDay(now);
  if (createdAt >= today) return "today";
  const day = new Date(today);
  day.setDate(day.getDate() - 1);
  if (createdAt >= day.getTime()) return "yesterday";
  day.setDate(day.getDate() - 5);
  if (createdAt >= day.getTime()) return "week";
  return "older";
}

/** Splits a newest-first list into day groups, keeping its order. */
export function groupInbox(
  items: readonly InboxItem[],
  now: Date,
): Array<{ group: InboxGroup; items: InboxItem[] }> {
  const groups: Array<{ group: InboxGroup; items: InboxItem[] }> = [];
  for (const item of items) {
    const group = inboxGroupOf(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last?.group === group) last.items.push(item);
    else groups.push({ group, items: [item] });
  }
  return groups;
}
