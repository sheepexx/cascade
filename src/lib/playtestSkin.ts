import type { PlaytestSkinChoice } from "../types";

/** Encodes a choice as a <select> value; "" keeps the editor's skin. */
export function playtestSkinValue(choice: PlaytestSkinChoice | null): string {
  if (!choice) return "";
  return choice.source === "none" ? "none" : `${choice.source}:${choice.fileName}`;
}

export function parsePlaytestSkinValue(value: string): PlaytestSkinChoice | null {
  if (value === "none") return { source: "none" };
  const split = value.indexOf(":");
  const source = value.slice(0, split);
  const fileName = value.slice(split + 1);
  if (split === -1 || !fileName) return null;
  return source === "preset" || source === "saved" ? { source, fileName } : null;
}

/** Stored settings are untrusted, so anything malformed keeps the editor's skin. */
export function normalizePlaytestSkin(input: unknown): PlaytestSkinChoice | null {
  if (!input || typeof input !== "object") return null;
  const { source, fileName } = input as { source?: unknown; fileName?: unknown };
  if (source === "none") return { source };
  if ((source === "preset" || source === "saved") && typeof fileName === "string" && fileName) {
    return { source, fileName };
  }
  return null;
}
