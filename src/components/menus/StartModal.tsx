import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { starColor } from "../../lib/starRating";
import { useAuth } from "../../lib/auth";
import {
  listMyProjectsRich,
  signedThumbUrls,
  type CloudProjectRich,
  type ProjectParticipant,
} from "../../lib/cloud";
import {
  listLocalProjects,
  type LocalProjectSummary,
} from "../../lib/persistence";

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

/** Maximum cards rendered per section before the rest are hidden. */
const MAX_CARDS = 9;

/**
 * First-run gate. Lets the user start from a blank editor or browse the bundled
 * "try these maps" gallery, and surfaces their existing work in three sections:
 * local saves, cloud projects they own, and maps they were invited to.
 */
export function WelcomeModal({
  open,
  onClose,
  onNewMap,
  onTryMaps,
  onOpenCloudProject,
  onOpenLocalProject,
}: {
  open: boolean;
  onClose: () => void;
  onNewMap: () => void;
  onTryMaps: () => void;
  /** Open one of the user's cloud maps (owned or shared) by id. */
  onOpenCloudProject: (id: string) => void;
  /** Open one of the locally saved projects from this browser. */
  onOpenLocalProject: (id: string) => void;
}) {
  const { user, login } = useAuth();
  const [projects, setProjects] = useState<CloudProjectRich[] | null>(null);
  const [localProjects, setLocalProjects] = useState<
    LocalProjectSummary[] | null
  >(null);
  const [cloudThumbs, setCloudThumbs] = useState<Record<string, string>>({});
  const [localThumbs, setLocalThumbs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  // Local projects (with background blobs for thumbnails).
  useEffect(() => {
    if (!open) {
      setLocalProjects(null);
      return;
    }
    let cancelled = false;
    setLocalError(null);
    listLocalProjects()
      .then((rows) => {
        if (!cancelled) setLocalProjects(rows);
      })
      .catch((e) => {
        if (!cancelled)
          setLocalError(
            e instanceof Error ? e.message : "Couldn't load local projects.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Turn local background blobs into object URLs, revoking them on change.
  useEffect(() => {
    if (!localProjects) return;
    const made: Record<string, string> = {};
    for (const p of localProjects) {
      if (p.backgroundBlob) made[p.id] = URL.createObjectURL(p.backgroundBlob);
    }
    setLocalThumbs(made);
    return () => {
      Object.values(made).forEach((u) => URL.revokeObjectURL(u));
    };
  }, [localProjects]);

  // Cloud projects (owned + shared), with thumbnails + participant avatars.
  useEffect(() => {
    if (!open || !user) {
      setProjects(null);
      setCloudThumbs({});
      return;
    }
    let cancelled = false;
    setError(null);
    listMyProjectsRich()
      .then(async (rows) => {
        if (cancelled) return;
        setProjects(rows);
        const paths = rows
          .map((r) => r.bg_path)
          .filter((p): p is string => !!p);
        try {
          const urls = await signedThumbUrls(paths);
          if (!cancelled) setCloudThumbs(urls);
        } catch {
          /* thumbnails are best-effort; cards fall back to a placeholder */
        }
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
    <Modal open={open} title="Get started" onClose={onClose} width="max-w-3xl">
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
      {localError && <p className="mt-4 text-sm text-rose-400">{localError}</p>}

      {/* 1. Local projects (this device) */}
      <Section
        title="Local projects"
        hint="saved on this device"
        count={localProjects?.length}
      >
        {localProjects === null ? (
          <SectionMessage>Loading…</SectionMessage>
        ) : localProjects.length === 0 ? (
          <SectionMessage>
            No local saves yet. Use Ctrl+S or enable autosave after starting a
            map.
          </SectionMessage>
        ) : (
          <CardGrid>
            {localProjects.slice(0, MAX_CARDS).map((p) => (
              <ProjectCard
                key={p.id}
                title={p.title || "Untitled"}
                subtitle={subtitleOf(p.artist, p.creator)}
                note={`${p.difficultyCount} diff${
                  p.difficultyCount === 1 ? "" : "s"
                } · saved ${new Date(p.updatedAt).toLocaleDateString()}`}
                thumbUrl={localThumbs[p.id]}
                onOpen={() => onOpenLocalProject(p.id)}
              />
            ))}
          </CardGrid>
        )}
      </Section>

      {/* 2. Cloud projects (owned) */}
      {user && (
        <Section
          title="Cloud projects"
          hint="saved to your account"
          count={projects === null ? undefined : owned.length}
        >
          {projects === null ? (
            <SectionMessage>Loading…</SectionMessage>
          ) : owned.length === 0 ? (
            <SectionMessage>
              No saved maps yet — use “Save to cloud” after you start one.
            </SectionMessage>
          ) : (
            <CardGrid>
              {owned.slice(0, MAX_CARDS).map((p) => (
                <ProjectCard
                  key={p.id}
                  title={p.title || "Untitled"}
                  subtitle={subtitleOf(p.artist, p.creator)}
                  note={`saved ${new Date(
                    p.updated_at,
                  ).toLocaleDateString()}`}
                  thumbUrl={p.bg_path ? cloudThumbs[p.bg_path] : undefined}
                  participants={othersOf(p.participants, user.id)}
                  onOpen={() => onOpenCloudProject(p.id)}
                />
              ))}
            </CardGrid>
          )}
        </Section>
      )}

      {/* 3. Mapping invitations (shared with you) */}
      {user && shared.length > 0 && (
        <Section
          title="Mapping invitations"
          hint="maps others shared with you"
          count={shared.length}
        >
          <CardGrid>
            {shared.slice(0, MAX_CARDS).map((p) => {
              const ownerName = p.participants.find(
                (x) => x.role === "owner",
              )?.username;
              return (
                <ProjectCard
                  key={p.id}
                  badge="Invited"
                  title={p.title || "Untitled"}
                  subtitle={subtitleOf(p.artist, p.creator)}
                  note={ownerName ? `shared by ${ownerName}` : undefined}
                  thumbUrl={p.bg_path ? cloudThumbs[p.bg_path] : undefined}
                  participants={othersOf(p.participants, user.id)}
                  onOpen={() => onOpenCloudProject(p.id)}
                />
              );
            })}
          </CardGrid>
        </Section>
      )}
    </Modal>
  );
}

/** "Artist · Creator", omitting empty parts. */
function subtitleOf(artist: string, creator: string): string {
  return [artist, creator].filter(Boolean).join(" · ");
}

/** Participants other than the current user (collaborators, or the map owner). */
function othersOf(
  participants: ProjectParticipant[],
  selfId: string,
): ProjectParticipant[] {
  return participants.filter((p) => p.user_id !== selfId);
}

/** A separated, titled section with an optional count and right-aligned hint. */
function Section({
  title,
  hint,
  count,
  children,
}: {
  title: string;
  hint?: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline gap-2 border-b border-white/10 pb-1.5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">
          {title}
        </h3>
        {count != null && (
          <span className="grid min-w-[1.25rem] place-items-center rounded-full bg-ink-600 px-1.5 text-[10px] font-semibold text-slate-300">
            {count}
          </span>
        )}
        {hint && (
          <span className="ml-auto text-[11px] text-slate-500">{hint}</span>
        )}
      </div>
      {children}
    </section>
  );
}

function SectionMessage({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500">{children}</p>;
}

function CardGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}

/** A project tile: background thumbnail, title/meta, and participant avatars. */
function ProjectCard({
  title,
  subtitle,
  note,
  thumbUrl,
  badge,
  participants,
  onOpen,
}: {
  title: string;
  subtitle?: string;
  note?: string;
  thumbUrl?: string;
  badge?: string;
  participants?: ProjectParticipant[];
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-xl border border-ink-500/60 bg-ink-700/40 text-left transition hover:border-accent/70 hover:bg-ink-700"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink-600">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full w-full place-items-center text-3xl text-slate-600">
            🎵
          </div>
        )}
        {badge && (
          <span className="absolute left-2 top-2 rounded-md bg-accent/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow">
            {badge}
          </span>
        )}
        {participants && participants.length > 0 && (
          <div className="absolute bottom-2 right-2">
            <AvatarStack participants={participants} />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-0.5 p-3">
        <div className="truncate text-sm font-semibold text-slate-100">
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-xs text-slate-400">{subtitle}</div>
        )}
        {note && (
          <div className="truncate text-[11px] text-slate-500">{note}</div>
        )}
      </div>
    </button>
  );
}

/** Small overlapping circle of participant avatars, with a "+N" overflow chip. */
function AvatarStack({
  participants,
  max = 4,
}: {
  participants: ProjectParticipant[];
  max?: number;
}) {
  const shown = participants.slice(0, max);
  const extra = participants.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p) => (
        <Avatar key={p.user_id} participant={p} />
      ))}
      {extra > 0 && (
        <span className="grid h-6 w-6 place-items-center rounded-full border-2 border-ink-800 bg-ink-600 text-[9px] font-semibold text-slate-200 shadow">
          +{extra}
        </span>
      )}
    </div>
  );
}

/** One avatar circle, falling back to the username's initial. */
function Avatar({ participant }: { participant: ProjectParticipant }) {
  const name = participant.username ?? "?";
  const title =
    participant.role === "owner" ? `${name} (owner)` : name;
  return participant.avatar_url ? (
    <img
      src={participant.avatar_url}
      alt={name}
      title={title}
      className="h-6 w-6 rounded-full border-2 border-ink-800 object-cover shadow"
    />
  ) : (
    <span
      title={title}
      className="grid h-6 w-6 place-items-center rounded-full border-2 border-ink-800 bg-ink-500 text-[9px] font-semibold text-slate-100 shadow"
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
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
