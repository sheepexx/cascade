import { isDesktopApp } from "./pwa";

const REMOTE_ORIGIN = "https://cascade.sheepex.net/";

const REMOTE_ONLY = /^maps\//;

export const DISCORD_INVITE = "https://discord.gg/zczMegSvgG";

/** Absolute address of a page on the website, such as the terms or a shared
 *  map. The desktop app's own origin is tauri.localhost, so there (and
 *  anywhere without a location) it points at the live site. */
export function siteUrl(path: string): string {
  const clean = path.replace(/^\/+/, "");
  if (isDesktopApp() || typeof location === "undefined") {
    return REMOTE_ORIGIN + clean;
  }
  return `${location.origin}/${clean}`;
}

export function siteAsset(path: string): string {
  const clean = path.replace(/^\/+/, "");
  if (isDesktopApp() && REMOTE_ONLY.test(clean)) return REMOTE_ORIGIN + clean;
  return `${import.meta.env.BASE_URL}${clean}`;
}
