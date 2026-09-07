import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/auth";
import { useT } from "../lib/i18n";
import { SharedMapPreview } from "./SharedMapPreview";
import { cardChips, formatLength } from "../lib/shareCard";
import { computeStarRating, starColor, starTextOn } from "../lib/starRating";
import { resolveSharedAudioUrl } from "../lib/sharedMapAudio";
import {
  countSharedView,
  loadSharedMap,
  requestSharedMapAccess,
  type SharedMap,
} from "../lib/sharedMap";
import type { LoadedFile } from "../types";
import { Select } from "./ui/Controls";

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
  const { user } = useAuth();
  const [map, setMap] = useState<SharedMap | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">("loading");
  const [busy, setBusy] = useState<"open" | "download" | null>(null);
  const [access, setAccess] = useState<"idle" | "sending" | "sent">("idle");
  const [accessError, setAccessError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewDifficultyId, setPreviewDifficultyId] = useState<string | null>(
    null,
  );

  const requestAccess = useCallback(() => {
    if (access !== "idle") return;
    setAccess("sending");
    setAccessError(null);
    requestSharedMapAccess(slug)
      .then(() => setAccess("sent"))
      .catch((e: unknown) => {
        setAccess("idle");
        setAccessError(
          e instanceof Error ? e.message : "Could not send the request.",
        );
      });
  }, [access, slug]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setPreviewDifficultyId(null);
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

  const [clipReady, setClipReady] = useState(false);

  useEffect(() => {
    setClipReady(false);
    if (!map?.previewUrl) return;
    let cancelled = false;
    fetch(map.previewUrl, { method: "HEAD" })
      .then((res) => {
        if (!cancelled && res.ok) setClipReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [map]);

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

  const previewDifficulties = useMemo(
    () =>
      map?.data.difficulties.filter((difficulty) => difficulty.notes.length) ??
      [],
    [map],
  );

  const previewOptions = useMemo(() => {
    return previewDifficulties
      .map((difficulty) => ({
        id: difficulty.id,
        label: difficulty.name,
        keyCount: difficulty.keyCount,
        starRating: computeStarRating(difficulty.notes, difficulty.keyCount),
      }))
      .sort((a, b) => a.starRating - b.starRating);
  }, [previewDifficulties]);

  const preview = useMemo(() => {
    return (
      previewDifficulties.find(
        (difficulty) => difficulty.id === previewDifficultyId,
      ) ??
      previewDifficulties.find(
        (difficulty) => difficulty.id === previewOptions[0]?.id,
      ) ??
      null
    );
  }, [previewDifficulties, previewDifficultyId, previewOptions]);

  const previewAudioUrl =
    preview && map
      ? resolveSharedAudioUrl(
          map.audioUrls,
          map.audioUrl,
          preview.audioFilename,
        )
      : null;

  const usePreviewClip =
    clipReady &&
    preview != null &&
    map?.data.previewClipStartMs != null &&
    preview.id === previewDifficulties[0]?.id &&
    previewAudioUrl === map?.audioUrl &&
    (preview.audioRate ?? 1) === 1;

  const makeOsz = useCallback(async (): Promise<Blob | null> => {
    if (!map) return null;
    const legacyAudioName =
      map.data.difficulties.find((difficulty) => difficulty.audioFilename)
        ?.audioFilename ?? "audio.mp3";
    const audioSources = Object.entries(map.audioUrls);
    if (!audioSources.length && map.audioUrl) {
      audioSources.push([legacyAudioName, map.audioUrl]);
    }
    const [{ buildOsz }, [audioResults, background]] = await Promise.all([
      import("../lib/oszExport"),
      Promise.all([
        Promise.all(
          audioSources.map(([name, url]) => fetchAsset(url, name)),
        ),
        fetchAsset(map.backgroundUrl, "background.jpg"),
      ]),
    ]);
    const audio = audioResults.filter(
      (file): file is LoadedFile => file !== null,
    );
    if (audioSources.length > 0 && audio.length !== audioSources.length) {
      throw new Error("One or more map audio files could not be downloaded.");
    }
    const legacyAudio = Object.keys(map.audioUrls).length ? null : audio[0];
    const difficulties = map.data.difficulties.map((d) => ({
      ...d,
      audioFilename: legacyAudio?.name ?? d.audioFilename,
      backgroundFilename: background
        ? background.name
        : d.backgroundFilename,
    }));
    return buildOsz({
      meta: map.data.meta,
      difficulties,
      timingPoints: map.data.timingPoints,
      audioFiles: Object.fromEntries(audio.map((file) => [file.name, file])),
      bgFiles: background ? { [background.name]: background } : {},
    });
  }, [map]);

  const open = useCallback(async () => {
    if (!map || busy) return;
    setBusy("open");
    setActionError(null);
    try {
      const blob = await makeOsz();
      if (blob) onOpen(new File([blob], `${map.title || "map"}.osz`));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not open this map.",
      );
    } finally {
      setBusy(null);
    }
  }, [busy, makeOsz, map, onOpen]);

  const download = useCallback(async () => {
    if (!map || busy) return;
    setBusy("download");
    setActionError(null);
    try {
      const blob = await makeOsz();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${map.artist ? `${map.artist} - ` : ""}${map.title || "map"}.osz`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Could not download this map.",
      );
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

          {previewOptions.length > 1 && preview && (
            <label className="mx-auto mt-8 grid w-full max-w-[260px] gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t("shared.difficulty")}
              </span>
              <Select
                className="w-full"
                value={preview.id}
                onChange={(event) => setPreviewDifficultyId(event.target.value)}
              >
                {previewOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label || t("common.untitled")} · {option.keyCount}K ·
                    ★ {option.starRating.toFixed(2)}
                  </option>
                ))}
              </Select>
            </label>
          )}

          {preview && (
            <SharedMapPreview
              key={`${preview.id}-${usePreviewClip ? "clip" : "audio"}`}
              notes={preview.notes}
              keyCount={preview.keyCount}
              previewTime={preview.previewTime}
              audioUrl={usePreviewClip ? map.previewUrl : previewAudioUrl}
              audioRate={preview.audioRate}
              preservePitch={preview.preservePitch}
              clipStartsAtZero={usePreviewClip}
              startTimeMs={
                usePreviewClip ? map.data.previewClipStartMs : undefined
              }
              label={t("shared.preview")}
              stopLabel={t("shared.stopPreview")}
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
            {user && user.id !== map.owner && (
              <button
                type="button"
                onClick={requestAccess}
                disabled={access !== "idle"}
                className="rounded-xl border border-white/15 px-6 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:opacity-60"
              >
                {access === "sent"
                  ? t("shared.accessSent")
                  : access === "sending"
                    ? t("common.loading")
                    : t("shared.requestAccess")}
              </button>
            )}
          </div>

          {accessError && (
            <p className="mt-3 text-sm text-rose-400">{accessError}</p>
          )}
          {actionError && (
            <p className="mt-3 text-sm text-rose-400">{actionError}</p>
          )}

          <p className="mt-10 text-xs text-slate-500">
            {formatLength(map.lengthMs) ?? ""}
          </p>
        </div>
      </div>
    </div>
  );
}
