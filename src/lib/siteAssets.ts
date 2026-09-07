import { isDesktopApp } from "./pwa";

const REMOTE_ORIGIN = "https://cascade.sheepex.net/";

const REMOTE_ONLY = /^maps\//;

export function siteAsset(path: string): string {
  const clean = path.replace(/^\/+/, "");
  if (isDesktopApp() && REMOTE_ONLY.test(clean)) return REMOTE_ORIGIN + clean;
  return `${import.meta.env.BASE_URL}${clean}`;
}
