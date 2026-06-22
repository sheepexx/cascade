import { supabase } from "./supabase";

export type AnalyticsEventType =
  | "export_osu"
  | "export_osz"
  | "local_project_created";

type BrowserInfo = {
  browser: string;
  browser_version: string | null;
  os: string | null;
};

export async function logAnalyticsEvent(
  eventType: AnalyticsEventType,
  userId?: string | null,
): Promise<void> {
  const info = browserInfo();
  const { error } = await supabase.from("analytics_events").insert({
    user_id: userId ?? null,
    event_type: eventType,
    browser: info.browser,
    browser_version: info.browser_version,
    os: info.os,
  });
  if (error) throw new Error(error.message);
}

function browserInfo(): BrowserInfo {
  const ua = navigator.userAgent;
  const browserMatch =
    match(ua, /(Edg)\/([\d.]+)/, "Edge") ??
    match(ua, /(OPR)\/([\d.]+)/, "Opera") ??
    match(ua, /(Firefox)\/([\d.]+)/, "Firefox") ??
    match(ua, /(Chrome)\/([\d.]+)/, "Chrome") ??
    match(ua, /(Version)\/([\d.]+).*Safari/, "Safari");

  return {
    browser: browserMatch?.name ?? "Unknown",
    browser_version: browserMatch?.version ?? null,
    os: detectOs(ua),
  };
}

function match(
  ua: string,
  pattern: RegExp,
  name: string,
): { name: string; version: string } | null {
  const m = ua.match(pattern);
  return m ? { name, version: m[2] ?? null } : null;
}

function detectOs(ua: string): string | null {
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X/i.test(ua)) return "macOS";
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}
