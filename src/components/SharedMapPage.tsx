import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../lib/i18n";
import { buildOsz } from "../lib/oszExport";
import { cardChips, formatLength } from "../lib/shareCard";
import { starColor, starTextOn } from "../lib/starRating";
import {
  countSharedView,
  loadSharedMap,
  type SharedMap,
} from "../lib/sharedMap";
import type { LoadedFile } from "../types";

type Fetched = { audio: LoadedFile | null; background: LoadedFile | null };

async function fetchAsset(
  url: string | null,
  name: string,
): Promise<LoadedFile | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return { name, url, blob };
  } catch {
    return null;
  }
}

export function SharedMapPage({
  slug,
  onOpen,
}: {
  slug: string;
  onOpen: (file: File) => void;
}) {
  const t = useT();
  const [map, setMap] = useState<SharedMap | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [busy, setBusy] = useState<"open" | "download" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    loadSharedMap(slug)
      .then((found) => {
        if (cancelled) return;
        setMap(found);
        setState(found ? "ready" : "missing");
        if (found) void countSharedView(slug).catch(() => {});
      })
      .catch(() => {
        if (!cancelled) setState("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!map) return;
    const previous = document.title;
    document.title = `${map.artist ? `${map.artist} - ` : ""}${map.title} | Cascade`;
    return () => {
      document.title = previous;
    };
  }, [map]);

  const chips = useMemo(
    () =>
      map
        ? cardChips({
            title: map.title,
            artist: map.artist,
            creator: map.creator,
            keyCounts: map.keyCounts,
            starRating: map.starRating,
            lengthMs: map.lengthMs,
            bpm: map.bpm,
            noteCount: map.noteCount,
          })
        : [],
    [map],
  );

  const makeOsz = useCallback(async (): Promise<Blob | null> => {
    if (!map) return null;
    const [audio, background]: [LoadedFile | null, LoadedFile | null] =
      await Promise.all([
        fetchAsset(
          map.audioUrl,
          map.data.difficulties.find((d) => d.audioFilename)?.audioFilename ??
            "audio.mp3",
        ),
        fetchAsset(map.backgroundUrl, "background.jpg"),
      ] as [Promise<LoadedFile | null>, Promise<LoadedFile | null>]);
    const fetched: Fetched = { audio, background };
    const difficulties = map.data.difficulties.map((d) => ({
      ...d,
      audioFilename: fetched.audio?.name ?? d.audioFilename,
      backgroundFilename: fetched.background
        ? fetched.background.name
        : d.backgroundFilename,
    }));
    return buildOsz({
      meta: map.data.meta,
      difficulties,
      timingPoints: map.data.timingPoints,
      audioFiles: fetched.audio ? { [fetched.audio.name]: fetched.audio } : {},
      bgFiles: fetched.background
        ? { [fetched.background.name]: fetched.background }
        : {},
    });
  }, [map]);

  const open = useCallback(async () => {
    if (!map || busy) return;
    setBusy("open");
    try {
      const blob = await makeOsz();
      if (blob) onOpen(new File([blob], `${map.title || "map"}.osz`));
    } finally {
      setBusy(null);
    }
  }, [busy, makeOsz, map, onOpen]);

  const download = useCallback(async () => {
    if (!map || busy) return;
    setBusy("download");
    try {
      const blob = await makeOsz();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${map.artist ? `${map.artist} - ` : ""}${map.title || "map"}.osz`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } finally {
      setBusy(null);
    }
  }, [busy, makeOsz, map]);

  if (state === "loading") {
    return (
      <div className="grid h-full place-items-center text-sm text-slate-400">
        {t("shared.loading")}
      </div>
    );
  }

  if (state === "missing" || !map) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <p className="text-lg font-semibold text-slate-200">
            {t("shared.notFound")}
          </p>
          <a
            href="/"
            className="mt-4 inline-block rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-soft"
          >
            {t("shared.toEditor")}
          </a>
        </div>
      </div>
    );
  }

  const star = map.starRating ?? 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="relative min-h-full">
        {map.backgroundUrl && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <img
              src={map.backgroundUrl}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full scale-105 object-cover opacity-30 blur-[3px]"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-ink-900/85 via-ink-900/75 to-ink-900/95" />
          </div>
        )}

        <div className="relative mx-auto flex max-w-3xl flex-col px-6 py-14">
          <a
            href="/"
            className="mb-10 flex items-center gap-3 self-start text-slate-300 transition hover:text-white"
          >
            <img src="/favicon.png?v=3" alt="" aria-hidden className="h-8 w-8 rounded-lg" />
            <span className="text-base font-bold">Cascade</span>
          </a>

          <h1 className="text-3xl font-bold leading-tight text-slate-100 sm:text-4xl">
            {map.title || "Untitled"}
          </h1>
          {map.artist && (
            <p className="mt-2 text-lg text-slate-400">{map.artist}</p>
          )}
          {map.creator && (
            <p className="mt-1 text-sm font-medium text-slate-300">
              {t("shared.mappedBy", { name: map.creator })}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            {star > 0 && (
              <span
                className="rounded-lg px-3 py-1.5 text-sm font-bold"
                style={{ background: starColor(star), color: starTextOn(star) }}
              >
                ★ {star.toFixed(2)}
              </span>
            )}
            {chips.map((chip) => (
              <span
                key={chip}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-sm text-slate-300"
              >
                {chip}
              </span>
            ))}
          </div>

          {map.audioUrl && (
            <audio
              src={map.audioUrl}
              controls
              preload="none"
              className="mt-8 w-full"
            />
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={open}
              disabled={busy !== null}
              className="rounded-xl bg-accent px-6 py-3 text-sm font-semibold text-white transition hover:bg-accent-soft disabled:opacity-60"
            >
              {busy === "open" ? t("common.loading") : t("shared.openInCascade")}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={busy !== null}
              className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:opacity-60"
            >
              {busy === "download" ? t("common.loading") : t("shared.download")}
            </button>
          </div>

          <p className="mt-10 text-xs text-slate-500">
            {formatLength(map.lengthMs) ?? ""}
          </p>
        </div>
      </div>
    </div>
  );
}
