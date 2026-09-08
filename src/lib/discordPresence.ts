import type { DiscordPresenceMode } from "../types";
import { isDesktopApp } from "./pwa";

export type PresenceInput = {
  mode: DiscordPresenceMode;
  song: string | null;
  difficulty: string | null;
  keyCount: number | null;
  playtesting: boolean;
};

export function presenceDetails(input: PresenceInput): string | null {
  if (input.mode !== "detailed") return null;
  const song = input.song?.trim();
  return song ? song : "In the editor";
}

export function presenceState(input: PresenceInput): string | null {
  if (input.mode !== "detailed") return null;
  const verb = input.playtesting ? "Playtesting" : "Editing";
  const parts: string[] = [verb];
  const difficulty = input.difficulty?.trim();
  if (difficulty) parts.push(`[${difficulty}]`);
  if (input.keyCount) parts.push(`${input.keyCount}K`);
  return parts.join(" ");
}

export async function updatePresence(input: PresenceInput): Promise<void> {
  if (!isDesktopApp()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("presence_update", {
    mode: input.mode,
    details: presenceDetails(input),
    state: presenceState(input),
  });
}
