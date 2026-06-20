import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { starColor } from "../../lib/starRating";
import { useAuth } from "../../lib/auth";
import {
  listProjectsCloud,
  type CloudProjectSummary,
} from "../../lib/cloud";

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
  onOpenCloudProject,
}: {
  open: boolean;
  onClose: () => void;
  onNewMap: () => void;
  onTryMaps: () => void;
  /** Open one of the user's cloud maps (owned or shared) by id. */
  onOpenCloudProject: (id: string) => void;
}) {
  const { user, login } = useAuth();
  const [projects, setProjects] = useState<CloudProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) {
      setProjects(null);
      return;
    }
    let cancelled = false;
    setError(null);
    listProjectsCloud()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Couldn't load your maps.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, user]);

  const owned = user ? (projects ?? []).filter((p) => p.owner === user.id) : [];
  const shared = user
    ? (projects ?? []).filter((p) => p.owner !== user.id)
    : [];

  return (
    <Modal open={open} title="Get started" onClose={onClose} width="max-w-2xl">
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

      {/* Signed-out prompt */}
      {!user && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-700/30 px-4 py-3">
          <span className="text-sm text-slate-400">
            Log in with osu! to see your saved maps and mapping invitations.
          </span>
          <Button variant="accent" onClick={login} className="whitespace-nowrap">
            Log in with osu!
          </Button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}

      {/* Invitations (maps shared with you) */}
      {user && shared.length > 0 && (
        <ProjectSection
          title="Mapping invitations"
          subtitle="Maps others shared with you"
          projects={shared}
          onOpen={onOpenCloudProject}
        />
      )}

      {/* Your own cloud maps */}
      {user && (
        <ProjectSection
          title="Your maps"
          projects={owned}
          onOpen={onOpenCloudProject}
          emptyHint={
            projects === null
              ? "Loading…"
              : "No saved maps yet — use “Save to cloud” after you start one."
          }
        />
      )}
    </Modal>
  );
}

/** A labeled list of cloud projects with Open buttons. */
function ProjectSection({
  title,
  subtitle,
  projects,
  onOpen,
  emptyHint,
}: {
  title: string;
  subtitle?: string;
  projects: CloudProjectSummary[];
  onOpen: (id: string) => void;
  emptyHint?: string;
}) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-baseline gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          {title}
        </h3>
        {subtitle && (
          <span className="text-[11px] text-slate-500">{subtitle}</span>
        )}
      </div>
      {projects.length === 0 ? (
        emptyHint && <p className="text-sm text-slate-500">{emptyHint}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {projects.slice(0, 8).map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-3 rounded-lg border border-ink-600 bg-ink-700/40 px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-100">
                  {p.title || "Untitled"}
                </div>
                <div className="truncate text-[11px] text-slate-500">
                  {p.artist}
                  {p.creator ? ` · ${p.creator}` : ""} · saved{" "}
                  {new Date(p.updated_at).toLocaleDateString()}
                </div>
              </div>
              <Button variant="accent" onClick={() => onOpen(p.id)}>
                Open
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
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
            return (
              <button
                key={map.id}
                type="button"
                onClick={() => onSelect(map)}
                className="group flex flex-col overflow-hidden rounded-xl border border-ink-500/60 bg-ink-700/40 text-left transition hover:border-accent/70 hover:bg-ink-700"
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
