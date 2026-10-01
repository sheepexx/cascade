import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AccountSettings } from "../lib/accountCloud";
import {
  loadAccountSettings,
  normalizeAccountSettings,
  saveAccountSettings,
} from "../lib/accountCloud";
import type { AuthUser } from "../lib/auth";
import type { Locale } from "../lib/i18n/core";
import { loadVolume } from "../lib/persistence";
import type { AppSettings, HitsoundSkinSource, ViewState } from "../types";
import { normalizeAppSettings } from "./appSettings";

/**
 * Keeps a signed-in user's settings, view, volume, language and hitsound
 * source in their account: loaded once on sign-in (or seeded from this device
 * the first time), then saved a moment after each change.
 */
export function useAccountSettingsSync({
  appSettings,
  authUser,
  authUserRef,
  hitsoundSkinSource,
  locale,
  musicVolume,
  setAppSettings,
  setAudioVolume,
  setHitsoundSkinSource,
  setLocale,
  setView,
  view,
}: {
  appSettings: AppSettings;
  authUser: AuthUser | null;
  authUserRef: MutableRefObject<AuthUser | null>;
  hitsoundSkinSource: HitsoundSkinSource;
  locale: Locale;
  musicVolume: number;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  setAudioVolume: (v: number) => void;
  setHitsoundSkinSource: Dispatch<SetStateAction<HitsoundSkinSource>>;
  setLocale: (locale: Locale) => void;
  setView: Dispatch<SetStateAction<ViewState>>;
  view: ViewState;
}) {
  const [accountSyncStatus, setAccountSyncStatus] = useState<
    "idle" | "syncing" | "synced" | "error"
  >("idle");
  const [accountSyncError, setAccountSyncError] = useState<string | null>(null);
  const accountSettingsReadyUserRef = useRef<string | null>(null);
  const lastCloudSettingsRef = useRef<string | null>(null);
  const accountSettingsSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const accountSettingsSaveVersionRef = useRef(0);

  const accountSettings = useMemo<AccountSettings>(
    () => ({
      version: 1,
      appSettings,
      view,
      volume: musicVolume,
      locale,
      hitsoundSkinSource,
    }),
    [appSettings, view, musicVolume, locale, hitsoundSkinSource],
  );
  const accountSettingsRef = useRef(accountSettings);
  accountSettingsRef.current = accountSettings;

  useEffect(() => {
    const userId = authUser?.id;
    accountSettingsSaveVersionRef.current += 1;
    accountSettingsReadyUserRef.current = null;
    lastCloudSettingsRef.current = null;
    if (!userId) {
      setAccountSyncStatus("idle");
      setAccountSyncError(null);
      return;
    }
    let cancelled = false;
    setAccountSyncStatus("syncing");
    setAccountSyncError(null);
    const local = {
      ...accountSettingsRef.current,
      volume: loadVolume() ?? accountSettingsRef.current.volume,
    };
    void loadAccountSettings(userId)
      .then(async (remote) => {
        if (cancelled) return;
        const next = remote
          ? normalizeAccountSettings(remote, local)
          : local;
        const applied = {
          ...next,
          appSettings: normalizeAppSettings(next.appSettings),
        };
        if (remote) {
          setAppSettings(applied.appSettings);
          setView(applied.view);
          setAudioVolume(applied.volume);
          setLocale(applied.locale);
          setHitsoundSkinSource(applied.hitsoundSkinSource);
        } else {
          await saveAccountSettings(userId, applied);
        }
        if (cancelled) return;
        lastCloudSettingsRef.current = JSON.stringify(applied);
        accountSettingsReadyUserRef.current = userId;
        setAccountSyncStatus("synced");
      })
      .catch((error) => {
        if (cancelled) return;
        setAccountSyncError(
          error instanceof Error ? error.message : "Cloud settings sync failed.",
        );
        setAccountSyncStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [authUser?.id, setAudioVolume, setLocale, setHitsoundSkinSource, setAppSettings, setView]);

  useEffect(() => {
    const userId = authUser?.id;
    if (!userId || accountSettingsReadyUserRef.current !== userId) return;
    const serialized = JSON.stringify(accountSettings);
    if (serialized === lastCloudSettingsRef.current) return;
    const version = ++accountSettingsSaveVersionRef.current;
    const id = window.setTimeout(() => {
      setAccountSyncStatus("syncing");
      setAccountSyncError(null);
      const save = accountSettingsSaveQueueRef.current
        .catch(() => {})
        .then(() => saveAccountSettings(userId, accountSettings));
      accountSettingsSaveQueueRef.current = save.catch(() => {});
      void save
        .then(() => {
          if (
            authUserRef.current?.id !== userId ||
            accountSettingsSaveVersionRef.current !== version
          ) {
            return;
          }
          lastCloudSettingsRef.current = serialized;
          setAccountSyncStatus("synced");
        })
        .catch((error) => {
          if (
            authUserRef.current?.id !== userId ||
            accountSettingsSaveVersionRef.current !== version
          ) {
            return;
          }
          setAccountSyncError(
            error instanceof Error ? error.message : "Cloud settings sync failed.",
          );
          setAccountSyncStatus("error");
        });
    }, 800);
    return () => window.clearTimeout(id);
  }, [authUser?.id, accountSettings, authUserRef]);

  return {
    accountSyncError,
    accountSyncStatus,
  };
}
