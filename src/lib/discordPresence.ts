import type { DiscordPresenceMode } from "../types";
import { isDesktopApp } from "./pwa";

export type PresenceInput = {
  mode: DiscordPresenceMode;
  projectOpen: boolean;
  song: string | null;
  difficulty: string | null;
  keyCount: number | null;
  playtesting: boolean;
};

const SHOWS_ACTIVITY = new Set<DiscordPresenceMode>(["activity", "detailed"]);

export function presenceDetails(input: PresenceInput): string | null {
  if (!SHOWS_ACTIVITY.has(input.mode)) return null;
  if (!input.projectOpen) return "In the main menu";
  // Activity mode never names the map: an unreleased song stays a secret.
  if (input.mode === "activity") return "Mapping";
  const song = input.song?.trim();
  return song ? song : "In the editor";
}

export function presenceState(input: PresenceInput): string | null {
  if (!SHOWS_ACTIVITY.has(input.mode) || !input.projectOpen) return null;
  const verb = input.playtesting ? "Playtesting" : "Editing";
  const parts: string[] = [verb];
  const difficulty = input.difficulty?.trim();
  if (difficulty && input.mode === "detailed") parts.push(`[${difficulty}]`);
  if (input.keyCount) parts.push(`${input.keyCount}K`);
  return parts.join(" ");
}

export async function updatePresence(input: PresenceInput): Promise<void> {
  if (!isDesktopApp()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("presence_update", {
    // The desktop side knows off, minimal and detailed; activity is detailed
    // with the map's names already left out of the text above.
    mode: input.mode === "activity" ? "detailed" : input.mode,
    details: presenceDetails(input),
    state: presenceState(input),
  });
}
