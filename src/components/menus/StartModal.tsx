import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { starColor } from "../../lib/starRating";

/** A single difficulty entry from the bundled maps manifest. */
export type SampleDifficulty = {
  name: string;
  keyCount: number;
  stars: number;
};

/** One bundled map (`public/maps/manifest.json`). */
export type SampleMap = {
  id: string;
  title: string;
  artist: string;
  creator: string;
  /** Path to the `.osz`, relative to the site base. */
  osz: string;
  /** Path to the banner image, relative to the site base, or `null`. */
  banner: string | null;
  difficulties: SampleDifficulty[];
};

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

/** Readable text color (black/white) for a `rgb(...)` background. */
function textOn(rgb: string): string {
  const m = rgb.match(/\d+/g);
  if (!m) return "#000";
  const [r, g, b] = m.map(Number);
  // Perceived luminance (sRGB) - pick black on light colors, white on dark.
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#000" : "#fff";
}

/**
 * First-run gate. Lets the user start from a blank editor or browse the
 * bundled "try these maps" gallery.
 */
export function WelcomeModal({
  open,
  onClose,
  onNewMap,
  onTryMaps,
}: {
  open: boolean;
  onClose: () => void;
  onNewMap: () => void;
  onTryMaps: () => void;
}) {
  return (
    <Modal open={open} title="Get started" onClose={onClose} width="max-w-lg">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onNewMap}
          className="group flex flex-col items-start gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 p-5 text-left transition hover:border-accent/70 hover:bg-ink-700"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-2xl transition group-hover:bg-accent/20">
            ✚
          </span>
          <span className="text-sm font-semibold text-slate-100">New Map</span>
          <span className="text-xs text-slate-400">
            Start from a blank editor. Drop audio, set the BPM and place notes.
          </span>
        </button>
        <button
          type="button"
          onClick={onTryMaps}
          className="group flex flex-col items-start gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 p-5 text-left transition hover:border-accent/70 hover:bg-ink-700"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-2xl transition group-hover:bg-accent/20">
            🎶
          </span>
          <span className="text-sm font-semibold text-slate-100">
            Try these maps
          </span>
          <span className="text-xs text-slate-400">
            Load a ready-made beatmap to explore the editor right away.
          </span>
        </button>
      </div>
    </Modal>
  );
}

/** Gallery of the bundled maps, with banner, title, mapper and star ratings. */
export function SampleMapsModal({
  open,
  onClose,
  onBack,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onBack: () => void;
  onSelect: (map: SampleMap) => void;
}) {
  const [maps, setMaps] = useState<SampleMap[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || maps) return;
    let cancelled = false;
    fetch(asset("maps/manifest.json"))
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: SampleMap[]) => {
        if (!cancelled) setMaps(data);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load maps.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, maps]);

  const handleSelect = (map: SampleMap) => {
    setLoadingId(map.id);
    onSelect(map);
  };

  return (
    <Modal
      open={open}
      title="Try these maps"
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      }
    >
      {error && (
        <p className="text-sm text-rose-400">Couldn’t load maps: {error}</p>
      )}
      {!maps && !error && (
        <p className="text-sm text-slate-400">Loading maps…</p>
      )}
      {maps && (
        <div className="grid gap-3 sm:grid-cols-2">
          {maps.map((map) => {
            const stars = map.difficulties.map((d) => d.stars);
            const maxStars = stars.length ? Math.max(...stars) : 0;
            const isLoading = loadingId === map.id;
            return (
              <button
                key={map.id}
                type="button"
                disabled={loadingId !== null}
                onClick={() => handleSelect(map)}
                className="group flex flex-col overflow-hidden rounded-xl border border-ink-500/60 bg-ink-700/40 text-left transition hover:border-accent/70 hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <div className="relative aspect-[3.5/1] w-full overflow-hidden bg-ink-600">
                  {map.banner ? (
                    <img
                      src={asset(map.banner)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-2xl text-slate-500">
                      🎵
                    </div>
                  )}
                  <span
                    className="absolute right-2 top-2 rounded-md px-1.5 py-0.5 text-[11px] font-semibold shadow"
                    style={{
                      backgroundColor: starColor(maxStars),
                      color: textOn(starColor(maxStars)),
                    }}
                  >
                    ★ {maxStars.toFixed(2)}
                  </span>
                  {isLoading && (
                    <div className="absolute inset-0 grid place-items-center bg-black/60 text-xs font-medium text-slate-200">
                      Loading…
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 p-3">
                  <div>
                    <div className="truncate text-sm font-semibold text-slate-100">
                      {map.title}
                    </div>
                    <div className="truncate text-xs text-slate-400">
                      {map.artist}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-slate-500">
                      mapped by {map.creator}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {map.difficulties.map((d, i) => (
                      <span
                        key={i}
                        title={`${d.name} · ${d.keyCount}K · ${d.stars.toFixed(2)}★`}
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          backgroundColor: starColor(d.stars),
                          color: textOn(starColor(d.stars)),
                        }}
                      >
                        {d.keyCount}K {d.stars.toFixed(1)}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
