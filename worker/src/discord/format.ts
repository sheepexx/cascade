/**
 * Discord message building: Cascade's colours, Discord's limits, and text from
 * people (names, bug titles) made inert so it can't format, link or mention.
 */

/** Cascade's accent, and the status colours of the design system. */
export const COLORS = {
  accent: 0xe86868,
  ok: 0x34d399,
  warn: 0xfbbf24,
  danger: 0xfb7185,
  neutral: 0x2f2f3b,
} as const;

export const EPHEMERAL = 1 << 6;

export type Embed = {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  thumbnail?: { url: string };
  footer?: { text: string };
  timestamp?: string;
};

export type Button = {
  type: 2;
  style: 1 | 2 | 3 | 4 | 5;
  label: string;
  custom_id?: string;
  url?: string;
  disabled?: boolean;
};

export type ActionRow = { type: 1; components: Button[] };

export type Reply = {
  content?: string;
  embeds?: Embed[];
  components?: ActionRow[];
  ephemeral?: boolean;
};

/** Markdown, masked links and mentions in someone's text, shown literally. */
export function plain(text: string): string {
  return text
    .replace(/[\\*_~`|>#[\]()-]/g, (c) => `\\${c}`)
    .replace(/@/g, "@\u200b")
    .replace(/<(?=[@#:a])/g, "<\u200b");
}

export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** "12h 30m", "45m", "under a minute". */
export function duration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours >= 1) return minutes ? `${count(hours)}h ${minutes}m` : `${count(hours)}h`;
  if (minutes >= 1) return `${minutes}m`;
  return total > 0 ? "under a minute" : "0m";
}

export function count(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Discord renders this in each reader's own time zone. */
export function when(iso: string | null | undefined, style: "D" | "R" = "D"): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? `<t:${Math.floor(ms / 1000)}:${style}>` : null;
}

export function httpsUrl(value: unknown): string | null {
  return typeof value === "string" && /^https:\/\//i.test(value) && value.length <= 2048 ? value : null;
}

export function linkButton(label: string, url: string): ActionRow {
  return { type: 1, components: [{ type: 2, style: 5, label, url }] };
}

/** The fields of an embed, trimmed to what Discord accepts. */
export function embed(e: Embed): Embed {
  return {
    ...e,
    title: e.title ? clip(e.title, 256) : undefined,
    description: e.description ? clip(e.description, 4000) : undefined,
    fields: e.fields
      ?.filter((f) => f.value)
      .slice(0, 25)
      .map((f) => ({ ...f, name: clip(f.name, 256), value: clip(f.value, 1024) })),
    footer: e.footer ? { text: clip(e.footer.text, 2048) } : undefined,
  };
}

export function notice(text: string, color: number = COLORS.neutral, ephemeral = true): Reply {
  return { embeds: [embed({ description: text, color })], ephemeral };
}

/** The message body Discord expects, never pinging anyone. */
export function messageData(reply: Reply): Record<string, unknown> {
  return {
    content: reply.content,
    embeds: reply.embeds ?? [],
    components: reply.components ?? [],
    allowed_mentions: { parse: [] },
    flags: reply.ephemeral ? EPHEMERAL : 0,
  };
}
