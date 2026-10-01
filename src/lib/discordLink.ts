import { DISCORD_INVITE } from "./siteAssets";

/** Where a Discord link sits, so clicks can be counted per place. */
export type DiscordSource =
  | "start_screen"
  | "start_modal"
  | "account_menu"
  | "crash"
  | "export_check"
  | "feedback"
  | "palette";

/**
 * Counts a click on a Discord link by where it was, with nothing else
 * attached. Analytics loads only when someone clicks.
 */
export function trackDiscord(source: DiscordSource): void {
  void import("./analytics")
    .then(({ trackDiscordClick }) => trackDiscordClick(source))
    .catch(() => {});
}

/** Opens the invite in a new tab and counts the click. */
export function openDiscord(source: DiscordSource): void {
  window.open(DISCORD_INVITE, "_blank", "noopener,noreferrer");
  trackDiscord(source);
}
