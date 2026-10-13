import type { Message } from "./social";

/**
 * Ordering, grouping and link detection for a conversation. Messages are
 * rendered as text, never HTML; links are only ever http(s) URLs found in
 * that text.
 */

/** Adds or replaces messages by id, oldest first. */
export function mergeMessages<T extends Message>(current: readonly T[], incoming: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
  return [...byId.values()].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at) || a.id.localeCompare(b.id),
  );
}

export type MessageRun = { sender: string; messages: Message[] };
export type MessageDay = { key: string; label: string; runs: MessageRun[] };

const RUN_GAP_MS = 5 * 60_000;

function dayKey(at: Date): string {
  return `${at.getFullYear()}-${at.getMonth()}-${at.getDate()}`;
}

/** Splits a conversation into days, and days into runs by one sender. */
export function groupMessages(
  messages: readonly Message[],
  locale: string,
  now: Date = new Date(),
): MessageDay[] {
  const days: MessageDay[] = [];
  const today = dayKey(now);
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = dayKey(yesterdayDate);
  let previous: Message | null = null;
  for (const message of messages) {
    const at = new Date(message.created_at);
    const key = dayKey(at);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      const label =
        key === today
          ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(0, "day")
          : key === yesterday
            ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-1, "day")
            : at.toLocaleDateString(locale, { weekday: "long", month: "long", day: "numeric" });
      day = { key, label, runs: [] };
      days.push(day);
      previous = null;
    }
    const run = day.runs[day.runs.length - 1];
    if (
      run &&
      previous &&
      run.sender === message.sender &&
      at.getTime() - Date.parse(previous.created_at) < RUN_GAP_MS
    ) {
      run.messages.push(message);
    } else {
      day.runs.push({ sender: message.sender, messages: [message] });
    }
    previous = message;
  }
  return days;
}

export type TextPart = { text: string; href?: string };

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;

/** Splits text into plain parts and http(s) links, trimming trailing punctuation. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    let url = match[0];
    const trailing = /[.,;:!?)\]]+$/.exec(url);
    if (trailing) url = url.slice(0, -trailing[0].length);
    const start = match.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start) });
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        parts.push({ text: url, href: parsed.href });
      } else {
        parts.push({ text: url });
      }
    } catch {
      parts.push({ text: url });
    }
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts.length ? parts : [{ text }];
}
