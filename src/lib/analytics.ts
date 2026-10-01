import { getSupabase } from "./supabase";
import { isDesktopApp } from "./pwa";
import {
  createUsageTracker,
  existingInstallAtBoot,
  type FunnelStage,
  type MilestoneEvent,
  type MilestoneReport,
  type UsageTracker,
} from "./usageMilestones";

export type AnalyticsEventType =
  | "app_opened"
  | "export_osu"
  | "export_osz"
  | "export_sm"
  | "local_project_created"
  | "import_osz"
  | "import_sm"
  | "beatmap_import_by_id"
  | "playtest_started"
  | "sv_applied"
  | "rate_change_export"
  | "pack_export"
  | "preset_published"
  | "skin_imported"
  | "collab_joined"
  | "export_to_osu"
  | "import_from_osu"
  | "sync_to_osu"
  | "discord_click"
  | MilestoneEvent;

export type AnalyticsPlatform = "web" | "desktop";

type BrowserInfo = {
  browser: string;
  browser_version: string | null;
  os: string | null;
};

export function analyticsPlatform(): AnalyticsPlatform {
  return isDesktopApp() ? "desktop" : "web";
}

export function analyticsAppVersion(): string | null {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : null;
}

let allowedBySettings = true;

/** Mirrors the "Share anonymous usage statistics" setting. */
export function setUsageStatsEnabled(enabled: boolean): void {
  allowedBySettings = enabled;
}

/** Do Not Track and Global Privacy Control switch usage events off entirely. */
export function browserOptsOut(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.globalPrivacyControl === true || nav.doNotTrack === "1";
}

export function analyticsAllowed(): boolean {
  // The dev server would otherwise count every test run as a real visit.
  if (import.meta.env.DEV) return false;
  return allowedBySettings && !browserOptsOut();
}

export async function logAnalyticsEvent(
  eventType: AnalyticsEventType,
  userId?: string | null,
  extra: { cohortDay?: string | null; source?: string } = {},
): Promise<void> {
  if (!analyticsAllowed()) return;
  const supabase = await getSupabase();
  const info = browserInfo();
  const { error } = await supabase.from("analytics_events").insert({
    user_id: userId ?? null,
    event_type: eventType,
    browser: info.browser,
    browser_version: info.browser_version,
    os: info.os,
    platform: analyticsPlatform(),
    app_version: analyticsAppVersion(),
    // Only sent when set, so plain events keep working on a database that
    // hasn't been migrated for these columns yet.
    ...(extra.cohortDay ? { cohort_day: extra.cohortDay } : {}),
    ...(extra.source ? { source: extra.source.slice(0, 40) } : {}),
  });
  if (error) throw new Error(error.message);
}

let tracker: UsageTracker | null = null;

function usage(): UsageTracker {
  if (!tracker) {
    let store: Storage | null;
    try {
      store = typeof localStorage === "undefined" ? null : localStorage;
    } catch {
      store = null;
    }
    tracker = createUsageTracker({ store, isExistingInstall: existingInstallAtBoot() });
  }
  return tracker;
}

/** Milestones never carry the account, so they can't be tied to anyone. */
function sendMilestones(reports: MilestoneReport[]): void {
  for (const report of reports) {
    void logAnalyticsEvent(report.event, null, { cohortDay: report.cohortDay }).catch(() => {});
  }
}

export function trackAppOpened(): void {
  if (analyticsAllowed()) sendMilestones(usage().opened(new Date()));
}

export function trackFunnel(stage: FunnelStage): void {
  if (analyticsAllowed()) sendMilestones(usage().reached(stage));
}

/** Someone edited a map; reported at most once a week. */
export function trackMapping(): void {
  if (!analyticsAllowed()) return;
  sendMilestones(usage().mapped(new Date()));
  sendMilestones(usage().reached("edited"));
}

/** A Discord link was clicked; `source` says which one. No account attached. */
export function trackDiscordClick(source: string): void {
  void logAnalyticsEvent("discord_click", null, { source }).catch(() => {});
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
