import { useCallback, useEffect, useState } from "react";
import {
  deleteMapCardPreset,
  listMapCardPresets,
  saveMapCardPreset,
  type MapCardPreset,
} from "../lib/mapCardCloud";
import type { MapCardConfig } from "../lib/mapCard";
import { t } from "../lib/i18n/core";

export type MapCardPresetStatus = "signedOut" | "loading" | "ready" | "error";

const cache = new Map<string, MapCardPreset[]>();

function byName(a: MapCardPreset, b: MapCardPreset): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function useMapCardPresets(userId: string | null, active: boolean) {
  const [presets, setPresets] = useState<MapCardPreset[]>(() =>
    userId ? cache.get(userId) ?? [] : [],
  );
  const [status, setStatus] = useState<MapCardPresetStatus>(
    userId ? (cache.has(userId) ? "ready" : "loading") : "signedOut",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"saving" | "deleting" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (!userId) {
      setPresets([]);
      setStatus("signedOut");
      setError(null);
      return;
    }
    let cancelled = false;
    const cached = cache.get(userId);
    setPresets(cached ?? []);
    setStatus(cached ? "ready" : "loading");
    setError(null);
    listMapCardPresets(userId)
      .then((list) => {
        if (cancelled) return;
        cache.set(userId, list);
        setPresets(list);
        setStatus("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStatus(cached ? "ready" : "error");
        setError(message(err, t("mapCard.errPresetsLoad")));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, active, attempt]);

  const commit = useCallback(
    (next: MapCardPreset[]) => {
      if (userId) cache.set(userId, next);
      setPresets(next);
    },
    [userId],
  );

  const save = useCallback(
    async (name: string, config: MapCardConfig): Promise<MapCardPreset | null> => {
      if (!userId) {
        setError(t("mapCard.errPresetsSignedOut"));
        return null;
      }
      setBusy("saving");
      setError(null);
      try {
        const saved = await saveMapCardPreset(userId, name, config);
        commit(
          [
            ...(cache.get(userId) ?? []).filter(
              (preset) => preset.id !== saved.id && preset.name !== saved.name,
            ),
            saved,
          ].sort(byName),
        );
        return saved;
      } catch (err) {
        setError(message(err, t("mapCard.errPresetSave")));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [userId, commit],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      if (!userId) return false;
      setBusy("deleting");
      setError(null);
      try {
        await deleteMapCardPreset(id);
        commit((cache.get(userId) ?? []).filter((preset) => preset.id !== id));
        return true;
      } catch (err) {
        setError(message(err, t("mapCard.errPresetDelete")));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [userId, commit],
  );

  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  return { presets, status, error, busy, save, remove, retry };
}
