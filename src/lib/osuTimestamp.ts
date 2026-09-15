import type { ManiaNote, TimingPoint } from "../types";
import { toStableTick } from "./timing";

/**
 * An osu! editor timestamp, `01:11:974 (71974|4,72259|6)`: the time to jump
 * to and, for osu!mania, the notes it names by start millisecond and
 * zero-indexed column. Timestamps from other modes name combo numbers, which
 * say nothing about a mania difficulty, so those only carry the time.
 */
export type OsuTimestamp = {
  time: number;
  notes: { time: number; column: number }[];
};

/** `mm:ss:mmm`, padded the way osu! writes it; lead-in before 0 keeps its sign. */
export function formatOsuClock(ms: number): string {
  const sign = ms < 0 ? "-" : "";
  const t = Math.floor(Math.abs(ms));
  const minutes = Math.floor(t / 60000);
  const seconds = Math.floor(t / 1000) % 60;
  return `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}:${String(t % 1000).padStart(3, "0")}`;
}

/**
 * Notes as osu! stable's editor copies them: earliest first, left to right on
 * a row, each on the millisecond the .osu export writes. The trailing " - " is
 * stable's too, leaving room for the comment in a modding post.
 */
export function formatOsuTimestamp(
  notes: ManiaNote[],
  timingPoints: TimingPoint[],
): string | null {
  if (!notes.length) return null;
  const stamps = notes
    .map((n) => ({
      time: Math.max(0, toStableTick(n.startTime, timingPoints)),
      column: n.column,
    }))
    .sort((a, b) => a.time - b.time || a.column - b.column);
  const list = stamps.map((s) => `${s.time}|${s.column}`).join(",");
  return `${formatOsuClock(stamps[0].time)} (${list}) - `;
}

/** A timestamp as an osu:// link, which opens it in osu!'s editor. */
export function osuEditLink(timestamp: string): string {
  const bare = timestamp.trim().replace(/\s+-$/, "");
  return `osu://edit/${bare.replace(/ /g, "%20")}`;
}

// The shape osu-web turns into a link, anchored to the start so only text that
// is a timestamp, or begins with one like a modding comment, is read as one.
const TIMESTAMP = /^(\d{2,}):([0-5]\d)[:.](\d{3})(?:\s*\(([^)]*)\))?/;

/** Reads a raw editor timestamp or an osu://edit/ link; null for anything else. */
export function parseOsuTimestamp(input: string): OsuTimestamp | null {
  let text = input.trim();
  const link = text.match(/^osu:\/\/edit\/(.*)$/is);
  if (link) {
    try {
      text = decodeURIComponent(link[1]);
    } catch {
      text = link[1].replace(/%20/g, " ");
    }
  }
  const m = text.match(TIMESTAMP);
  if (!m) return null;
  const time = Number(m[1]) * 60000 + Number(m[2]) * 1000 + Number(m[3]);
  const notes: OsuTimestamp["notes"] = [];
  for (const part of (m[4] ?? "").split(",")) {
    const pair = part.trim().match(/^(\d+)\|(\d+)$/);
    if (pair) notes.push({ time: Number(pair[1]), column: Number(pair[2]) });
  }
  return { time, notes };
}

/**
 * The notes of a difficulty a timestamp names. A note matches in its column on
 * either the millisecond it sits on or the stable tick the export moves it to,
 * so timestamps from the original .osu and from Cascade's export both land.
 */
export function notesAtOsuTimestamp(
  stamp: OsuTimestamp,
  notes: ManiaNote[],
  timingPoints: TimingPoint[],
): ManiaNote[] {
  if (!stamp.notes.length) return [];
  const wanted = new Set(stamp.notes.map((s) => `${s.column}:${s.time}`));
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of stamp.notes) {
    lo = Math.min(lo, s.time);
    hi = Math.max(hi, s.time);
  }
  return notes.filter(
    (n) =>
      n.startTime >= lo - 2 &&
      n.startTime <= hi + 2 &&
      (wanted.has(`${n.column}:${Math.round(n.startTime)}`) ||
        wanted.has(`${n.column}:${toStableTick(n.startTime, timingPoints)}`)),
  );
}
