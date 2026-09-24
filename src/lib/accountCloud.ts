import type { Locale } from "./i18n";
import { isLocale } from "./i18n/core";
import { supabase } from "./supabase";
import {
  deleteUserMenuBackground,
  deleteUserSkin,
  downloadUserMenuBackground,
  downloadUserSkin,
  uploadUserMenuBackground,
  uploadUserSkin,
  type UserMenuBackgroundStorageRow,
} from "./storage";
import {
  DEFAULT_APP_SETTINGS,
  MAX_SCROLL_SPEED,
  MIN_SCROLL_SPEED,
  SNAP_OPTIONS,
  isAltWheelAction,
  type AppSettings,
  type HitsoundSkinSource,
  type ViewState,
} from "../types";
import { t } from "./i18n/core";

export type AccountSettings = {
  version: 1;
  appSettings: AppSettings;
  view: ViewState;
  volume: number;
  locale: Locale;
  hitsoundSkinSource: HitsoundSkinSource;
};

export type CloudSkin = {
  id: string;
  slot: 1 | 2;
  filename: string;
  storagePath: string;
  sha256: string;
  bytes: number;
  updatedAt: string;
};

export type CloudMenuBackground = {
  id: string;
  filename: string;
  storagePath: string;
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  updatedAt: string;
};

type UserMenuBackgroundRow = UserMenuBackgroundStorageRow;

type UserSkinRow = {
  id: string;
  slot: number;
  filename: string;
  storage_path: string;
  sha256: string;
  bytes: number | string;
  updated_at: string;
};

export async function loadAccountSettings(
  userId: string,
): Promise<unknown | null> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("settings")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.settings ?? null;
}

export async function saveAccountSettings(
  userId: string,
  settings: AccountSettings,
): Promise<void> {
  const { error } = await supabase.from("user_settings").upsert(
    { user_id: userId, settings },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
}

export function normalizeAccountSettings(
  value: unknown,
  fallback: AccountSettings,
): AccountSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const raw = value as Partial<AccountSettings>;
  const rawApp = objectValue(raw.appSettings);
  const rawPlaytest = objectValue(rawApp?.playtest);
  const app = rawApp
    ? {
        ...DEFAULT_APP_SETTINGS,
        ...rawApp,
        altWheelAction: isAltWheelAction(rawApp.altWheelAction)
          ? rawApp.altWheelAction
          : DEFAULT_APP_SETTINGS.altWheelAction,
        editorKeybinds: stringRecord(rawApp.editorKeybinds)
          ? rawApp.editorKeybinds
          : DEFAULT_APP_SETTINGS.editorKeybinds,
        playtest: {
          ...DEFAULT_APP_SETTINGS.playtest,
          ...rawPlaytest,
          keybinds: stringArrayRecord(rawPlaytest?.keybinds)
            ? rawPlaytest.keybinds
            : DEFAULT_APP_SETTINGS.playtest.keybinds,
          humanize: {
            ...DEFAULT_APP_SETTINGS.playtest.humanize,
            ...objectValue(rawPlaytest?.humanize),
          },
          skill: {
            ...DEFAULT_APP_SETTINGS.playtest.skill,
            ...objectValue(rawPlaytest?.skill),
          },
        },
      }
    : fallback.appSettings;
  const scrollSpeed = Number(raw.view?.scrollSpeed);
  const snapDivisor = Number(raw.view?.snapDivisor);
  const volume = Number(raw.volume);
  const source = raw.hitsoundSkinSource;
  return {
    version: 1,
    appSettings: app,
    view: {
      scrollSpeed: Number.isFinite(scrollSpeed)
        ? Math.round(Math.min(MAX_SCROLL_SPEED, Math.max(MIN_SCROLL_SPEED, scrollSpeed)))
        : fallback.view.scrollSpeed,
      snapDivisor: SNAP_OPTIONS.includes(snapDivisor)
        ? snapDivisor
        : fallback.view.snapDivisor,
    },
    volume: Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : fallback.volume,
    locale: isLocale(raw.locale) ? raw.locale : fallback.locale,
    hitsoundSkinSource:
      source === "default" || source === "selected" || source === "visual"
        ? source
        : fallback.hitsoundSkinSource,
  };
}

export async function listCloudSkins(userId: string): Promise<CloudSkin[]> {
  const { data, error } = await supabase
    .from("user_skins")
    .select("id,slot,filename,storage_path,sha256,bytes,updated_at")
    .eq("user_id", userId)
    .order("slot", { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as UserSkinRow[]).map(cloudSkinFromRow);
}

export async function uploadCloudSkin(
  slot: 1 | 2,
  file: File,
): Promise<CloudSkin> {
  if (!/\.(osk|zip)$/i.test(file.name)) {
    throw new Error(t("lib.chooseOsk"));
  }
  if (file.size <= 0 || file.size > 60 * 1024 * 1024) {
    throw new Error(t("lib.cloudSkinSize"));
  }
  const sha256 = await sha256Hex(file);
  return cloudSkinFromRow(await uploadUserSkin(slot, sha256, file.name, file));
}

export function downloadCloudSkin(slot: 1 | 2): Promise<Blob> {
  return downloadUserSkin(slot);
}

export function removeCloudSkin(slot: 1 | 2): Promise<void> {
  return deleteUserSkin(slot);
}

export async function loadCloudMenuBackground(
  userId: string,
): Promise<CloudMenuBackground | null> {
  const { data, error } = await supabase
    .from("user_menu_backgrounds")
    .select("id,filename,storage_path,sha256,bytes,width,height,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? cloudMenuBackgroundFromRow(data as UserMenuBackgroundRow) : null;
}

export async function uploadCloudMenuBackground(
  file: File,
): Promise<CloudMenuBackground> {
  const { prepareMenuBackground } = await import("./menuBackground");
  const prepared = await prepareMenuBackground(file);
  const sha256 = await sha256Hex(prepared.blob);
  const row = await uploadUserMenuBackground(
    sha256,
    file.name,
    prepared.width,
    prepared.height,
    prepared.blob,
  );
  return cloudMenuBackgroundFromRow(row);
}

export function downloadCloudMenuBackground(): Promise<Blob> {
  return downloadUserMenuBackground();
}

export function removeCloudMenuBackground(): Promise<void> {
  return deleteUserMenuBackground();
}

function cloudMenuBackgroundFromRow(
  row: UserMenuBackgroundRow,
): CloudMenuBackground {
  return {
    id: row.id,
    filename: row.filename,
    storagePath: row.storage_path,
    sha256: row.sha256,
    bytes: Number(row.bytes) || 0,
    width: Number(row.width) || 0,
    height: Number(row.height) || 0,
    updatedAt: row.updated_at,
  };
}

function cloudSkinFromRow(row: UserSkinRow): CloudSkin {
  return {
    id: row.id,
    slot: row.slot === 2 ? 2 : 1,
    filename: row.filename,
    storagePath: row.storage_path,
    sha256: row.sha256,
    bytes: Number(row.bytes) || 0,
    updatedAt: row.updated_at,
  };
}

async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringRecord(value: unknown): value is Record<string, string> {
  const record = objectValue(value);
  return !!record && Object.values(record).every((item) => typeof item === "string");
}

function stringArrayRecord(value: unknown): value is Record<number, string[]> {
  const record = objectValue(value);
  return (
    !!record &&
    Object.values(record).every(
      (item) => Array.isArray(item) && item.every((entry) => typeof entry === "string"),
    )
  );
}
