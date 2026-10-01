import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { CloudMenuBackground, CloudSkin } from "../lib/accountCloud";
import {
  downloadCloudMenuBackground,
  downloadCloudSkin,
  listCloudSkins,
  loadCloudMenuBackground,
  removeCloudMenuBackground,
  removeCloudSkin,
  uploadCloudMenuBackground,
  uploadCloudSkin,
} from "../lib/accountCloud";
import { logAnalyticsEvent } from "../lib/analytics";
import type { AuthUser } from "../lib/auth";
import { snapshotBlob } from "../lib/blobSnapshot";
import type { Translate } from "../lib/i18n";
import {
  deleteSkinFromLibrary,
  loadHitsoundSkinBlob,
  loadHitsoundSkinSource,
  loadSkinBlob,
  loadSkinLibrary,
  saveHitsoundSkinBlob,
  saveHitsoundSkinSource,
  saveSkinBlob,
  saveSkinToLibrary,
} from "../lib/persistence";
import type { SavedSkinBlob } from "../lib/persistence";
import type { AppSettings, HitsoundSkinSource, LoadedSkin } from "../types";

/**
 * The editor skin, the separate hitsound skin and where hitsounds come from,
 * the saved-skin library in this browser, the account's cloud skin slots and
 * its custom menu background. Restores the last skins on launch and keeps
 * them saved as they change.
 */
export function useSkins({
  appSettings,
  authUser,
  authUserRef,
  setAppSettings,
  t,
}: {
  appSettings: AppSettings;
  authUser: AuthUser | null;
  authUserRef: MutableRefObject<AuthUser | null>;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  t: Translate;
}) {
  const [skin, setSkin] = useState<LoadedSkin | null>(null);
  const [hitsoundSkin, setHitsoundSkin] = useState<LoadedSkin | null>(null);
  const [hitsoundSkinSource, setHitsoundSkinSource] =
    useState<HitsoundSkinSource>(() => loadHitsoundSkinSource());
  const [skinLibrary, setSkinLibrary] = useState<SavedSkinBlob[]>([]);
  const [cloudSkins, setCloudSkins] = useState<CloudSkin[]>([]);
  const [cloudSkinsLoading, setCloudSkinsLoading] = useState(false);
  const [menuBackground, setMenuBackground] =
    useState<CloudMenuBackground | null>(null);
  const [menuBackgroundUrl, setMenuBackgroundUrl] = useState<string | null>(null);
  const [menuBackgroundBusy, setMenuBackgroundBusy] = useState(false);
  const [menuBackgroundError, setMenuBackgroundError] = useState<string | null>(
    null,
  );
  const [skinError, setSkinError] = useState<string | null>(null);
  const refreshCloudSkins = useCallback(async () => {
    const userId = authUserRef.current?.id;
    if (!userId) {
      setCloudSkins([]);
      setCloudSkinsLoading(false);
      return;
    }
    setCloudSkinsLoading(true);
    try {
      setCloudSkins(await listCloudSkins(userId));
    } catch {
      setCloudSkins([]);
    } finally {
      setCloudSkinsLoading(false);
    }
  }, [authUserRef]);
  useEffect(() => {
    void refreshCloudSkins();
  }, [authUser?.id, refreshCloudSkins]);
  const refreshMenuBackground = useCallback(async () => {
    const userId = authUserRef.current?.id;
    if (!userId) {
      setMenuBackground(null);
      return;
    }
    try {
      setMenuBackground(await loadCloudMenuBackground(userId));
    } catch {
      setMenuBackground(null);
    }
  }, [authUserRef]);
  useEffect(() => {
    void refreshMenuBackground();
  }, [authUser?.id, refreshMenuBackground]);
  const effectiveHitsounds = useMemo(() => {
    if (hitsoundSkinSource === "default") return null;
    if (hitsoundSkinSource === "selected") {
      return hitsoundSkin?.hitsounds ?? null;
    }
    return skin?.hitsounds ?? null;
  }, [hitsoundSkin, hitsoundSkinSource, skin]);

  const refreshSkinLibrary = useCallback(async () => {
    const saved = await loadSkinLibrary().catch(() => []);
    setSkinLibrary(saved);
  }, []);

  const applyLoadedSkin = useCallback(
    (loaded: LoadedSkin, target: "visual" | "hitsound") => {
      void logAnalyticsEvent("skin_imported", authUserRef.current?.id).catch(
        () => {},
      );
      if (target === "hitsound") {
        setHitsoundSkin((prev) => {
          if (prev && prev !== skin) prev.objectUrls.forEach(URL.revokeObjectURL);
          return loaded;
        });
        setHitsoundSkinSource("selected");
      } else {
        setSkin((prev) => {
          if (prev && prev !== hitsoundSkin) {
            prev.objectUrls.forEach(URL.revokeObjectURL);
          }
          return loaded;
        });
      }
    },
    [hitsoundSkin, skin, authUserRef],
  );

  const loadSkin = useCallback(
    async (
      blob: Blob,
      fileName: string,
      target: "visual" | "hitsound",
      saveToLibrary: boolean,
    ) => {
      setSkinError(null);
      try {
        const snapshot = await snapshotBlob(blob);
        const { importOsk } = await import("../lib/skinImport");
        const loaded = await importOsk(snapshot, fileName);
        applyLoadedSkin(loaded, target);
        if (saveToLibrary) {
          await saveSkinToLibrary({ name: fileName, blob: snapshot });
          await refreshSkinLibrary();
        }
      } catch (err) {
        setSkinError(
          err instanceof Error ? err.message : "Failed to load skin (.osk).",
        );
      }
    },
    [applyLoadedSkin, refreshSkinLibrary],
  );

  const onSkinFile = useCallback(
    (file: File, target: "visual" | "hitsound") =>
      loadSkin(file, file.name, target, true),
    [loadSkin],
  );

  const onApplyLocalSkin = useCallback(
    (saved: SavedSkinBlob, target: "visual" | "hitsound") =>
      loadSkin(saved.blob, saved.name, target, false),
    [loadSkin],
  );

  const onDeleteLocalSkin = useCallback(
    async (saved: SavedSkinBlob) => {
      setSkinError(null);
      try {
        await deleteSkinFromLibrary(saved.name);
        await refreshSkinLibrary();
      } catch (error) {
        setSkinError(
          error instanceof Error
            ? error.message
            : "Couldn't remove that saved skin.",
        );
        throw error;
      }
    },
    [refreshSkinLibrary],
  );

  const onApplyPresetSkin = useCallback(
    async (url: string, fileName: string, target: "visual" | "hitsound") => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(t("app.presetSkinFailed"));
        await loadSkin(await res.blob(), fileName, target, false);
      } catch (err) {
        setSkinError(
          err instanceof Error ? err.message : "Couldn't load that preset skin.",
        );
      }
    },
    [loadSkin, t],
  );

  const onUploadCloudSkin = useCallback(
    async (slot: 1 | 2, file: File) => {
      setSkinError(null);
      try {
        await uploadCloudSkin(slot, file);
        await refreshCloudSkins();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Couldn't upload that skin.";
        setSkinError(message);
        throw error;
      }
    },
    [refreshCloudSkins],
  );

  const onDownloadCloudSkin = useCallback(
    async (cloudSkin: CloudSkin) => {
      setSkinError(null);
      try {
        const blob = await downloadCloudSkin(cloudSkin.slot);
        await loadSkin(blob, cloudSkin.filename, "visual", true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Couldn't download that skin.";
        setSkinError(message);
        throw error;
      }
    },
    [loadSkin],
  );

  const onDeleteCloudSkin = useCallback(
    async (cloudSkin: CloudSkin) => {
      setSkinError(null);
      try {
        await removeCloudSkin(cloudSkin.slot);
        await refreshCloudSkins();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Couldn't remove that skin.";
        setSkinError(message);
        throw error;
      }
    },
    [refreshCloudSkins],
  );

  // The picture itself is only fetched once it is going to be shown, so an
  // account that stays on song art never pays for the download. Keyed by the
  // checksum so replacing the picture swaps the object URL.
  const menuBackgroundKey =
    appSettings.menuBackgroundMode === "custom" && menuBackground
      ? menuBackground.sha256
      : null;
  useEffect(() => {
    if (!menuBackgroundKey) {
      setMenuBackgroundUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    downloadCloudMenuBackground()
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setMenuBackgroundUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setMenuBackgroundUrl(null);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [menuBackgroundKey]);

  const onUploadMenuBackground = useCallback(async (file: File) => {
    setMenuBackgroundError(null);
    setMenuBackgroundBusy(true);
    try {
      setMenuBackground(await uploadCloudMenuBackground(file));
      // Uploading one is a clear request to see it.
      setAppSettings((s) => ({ ...s, menuBackgroundMode: "custom" }));
    } catch (error) {
      setMenuBackgroundError(
        error instanceof Error ? error.message : "Couldn't upload that image.",
      );
    } finally {
      setMenuBackgroundBusy(false);
    }
  }, [setAppSettings]);

  const onRemoveMenuBackground = useCallback(async () => {
    setMenuBackgroundError(null);
    setMenuBackgroundBusy(true);
    try {
      await removeCloudMenuBackground();
      setMenuBackground(null);
      setAppSettings((s) =>
        s.menuBackgroundMode === "custom"
          ? { ...s, menuBackgroundMode: "song" }
          : s,
      );
    } catch (error) {
      setMenuBackgroundError(
        error instanceof Error ? error.message : "Couldn't remove that image.",
      );
    } finally {
      setMenuBackgroundBusy(false);
    }
  }, [setAppSettings]);

  const onClearSkin = useCallback(() => {
    setSkinError(null);
    setSkin((prev) => {
      if (prev) prev.objectUrls.forEach(URL.revokeObjectURL);
      return null;
    });
  }, []);

  const onUseDefaultHitsounds = useCallback(() => {
    setSkinError(null);
    setHitsoundSkinSource("default");
  }, []);

  const onUseVisualHitsounds = useCallback(() => {
    setSkinError(null);
    setHitsoundSkinSource("visual");
  }, []);

  const onUseSelectedHitsounds = useCallback(() => {
    setSkinError(null);
    if (hitsoundSkin) setHitsoundSkinSource("selected");
  }, [hitsoundSkin]);

  const skinLoadedRef = useRef(false);
  const hitsoundSkinLoadedRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshSkinLibrary();
      const rec = await loadSkinBlob().catch(() => null);
      if (!cancelled && rec) {
        const { importOsk } = await import("../lib/skinImport");
        const loaded = await importOsk(rec.blob, rec.name).catch(() => null);
        if (!cancelled && loaded) setSkin(loaded);
      }
      const hitsoundRec = await loadHitsoundSkinBlob().catch(() => null);
      if (!cancelled && hitsoundRec) {
        const { importOsk } = await import("../lib/skinImport");
        const loaded = await importOsk(hitsoundRec.blob, hitsoundRec.name).catch(
          () => null,
        );
        if (!cancelled && loaded) setHitsoundSkin(loaded);
      }
      if (!cancelled) skinLoadedRef.current = true;
      if (!cancelled) hitsoundSkinLoadedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshSkinLibrary]);

  useEffect(() => {
    if (!skinLoadedRef.current) return;
    void saveSkinBlob(skin ? { name: skin.fileName, blob: skin.blob } : null);
  }, [skin]);

  useEffect(() => {
    if (!hitsoundSkinLoadedRef.current) return;
    void saveHitsoundSkinBlob(
      hitsoundSkin
        ? { name: hitsoundSkin.fileName, blob: hitsoundSkin.blob }
        : null,
    );
  }, [hitsoundSkin]);

  useEffect(() => {
    saveHitsoundSkinSource(hitsoundSkinSource);
  }, [hitsoundSkinSource]);

  return {
    cloudSkins,
    cloudSkinsLoading,
    effectiveHitsounds,
    hitsoundSkin,
    hitsoundSkinSource,
    menuBackground,
    menuBackgroundBusy,
    menuBackgroundError,
    menuBackgroundUrl,
    onApplyLocalSkin,
    onApplyPresetSkin,
    onClearSkin,
    onDeleteCloudSkin,
    onDeleteLocalSkin,
    onDownloadCloudSkin,
    onRemoveMenuBackground,
    onSkinFile,
    onUploadCloudSkin,
    onUploadMenuBackground,
    onUseDefaultHitsounds,
    onUseSelectedHitsounds,
    onUseVisualHitsounds,
    setHitsoundSkinSource,
    skin,
    skinError,
    skinLibrary,
  };
}
