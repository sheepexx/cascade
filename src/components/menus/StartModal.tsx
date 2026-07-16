import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { starColor } from "../../lib/starRating";
import { useAuth } from "../../lib/auth";
import {
  listMyProjectsRich,
  signedThumbUrls,
  deleteProjectCloud,
  setProjectArchived,
  type CloudProjectRich,
  type ProjectParticipant,
} from "../../lib/cloud";
import {
  listLocalProjects,
  clearProject,
  type LocalProjectSummary,
} from "../../lib/persistence";
import { playUiSound } from "../../lib/uiSounds";
import {
  ArchiveIcon,
  NewMapIcon,
  PackCreatorIcon,
  SampleMapsIcon,
  SmPackIcon,
  TrashIcon,
} from "../ui/StartIcons";

export type SampleDifficulty = {
  name: string;
  keyCount: number;
  stars: number;
};

export type SampleMap = {
  id: string;
  title: string;
  artist: string;
  creator: string;
  osz: string;
  banner: string | null;
  difficulties: SampleDifficulty[];
};

const asset = (path: string) => `${import.meta.env.BASE_URL}${path}`;

function textOn(rgb: string): string {
  const m = rgb.match(/\d+/g);
  if (!m) return "#000";
  const [r, g, b] = m.map(Number);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#000" : "#fff";
}

const MAX_CARDS = 9;

export function WelcomeModal({
  open,
  onClose,
  onNewMap,
  onTryMaps,
  onImportSmPack,
  onPackCreator,
  onOpenCloudProject,
  onOpenLocalProject,
}: {
  open: boolean;
  onClose: () => void;
  onNewMap: () => void;
  onTryMaps: () => void;
  onImportSmPack?: () => void;
  onPackCreator?: () => void;
  onOpenCloudProject: (id: string) => void;
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
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [confirm, setConfirm] = useState<{
    scope: "local" | "cloud";
    id: string;
    title: string;
  } | null>(null);
  const [firstRun, setFirstRun] = useState(false);

  useEffect(() => {
    if (!open) return;
    try {
      if (!localStorage.getItem("mania:onboarded")) {
        setFirstRun(true);
        localStorage.setItem("mania:onboarded", "1");
      }
    } catch {
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      setConfirm(null);
      setShowArchived(false);
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
  const invited = shared.filter((p) => !p.archived);
  const archivedShared = shared.filter((p) => p.archived);
  const confirmBusy = confirm !== null && busyId === confirm.id;

  const cancelConfirm = () => {
    if (busyId) return;
    setConfirm(null);
  };

  const performDelete = async () => {
    if (!confirm) return;
    const { scope, id } = confirm;
    setBusyId(id);
    setError(null);
    try {
      if (scope === "local") {
        await clearProject(id);
        setLocalProjects((prev) => prev?.filter((p) => p.id !== id) ?? null);
      } else {
        await deleteProjectCloud(id);
        setProjects((prev) => prev?.filter((p) => p.id !== id) ?? null);
      }
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete that project.");
    } finally {
      setBusyId(null);
    }
  };

  const archive = (id: string, archived: boolean) =>
    void (async () => {
      setBusyId(id);
      setError(null);
      try {
        await setProjectArchived(id, archived);
        setProjects(
          (prev) =>
            prev?.map((p) => (p.id === id ? { ...p, archived } : p)) ?? null,
        );
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Couldn't update that project.",
        );
      } finally {
        setBusyId(null);
      }
    })();

  return (
    <>
      <Modal open={open} title="Get started" onClose={onClose} width="max-w-3xl">
      {firstRun && (
        <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 p-4">
          <p className="text-sm font-semibold text-slate-100">
            Welcome to Cascade, a free osu!mania editor in your browser.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            Nothing to install. The quickest way to see how it works is to load a
            ready-made map and press <span className="text-slate-100">Space</span>{" "}
            to play. Or start a blank map and drop in your own song.
          </p>
          <div className="mt-3">
            <Button variant="accent" onClick={onTryMaps}>
              Try a sample map →
            </Button>
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onNewMap}
          className="group flex flex-col items-start gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 p-5 text-left transition hover:border-accent/70 hover:bg-ink-700"
        >
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-slate-200 transition group-hover:bg-accent/20 group-hover:text-accent">
            <NewMapIcon className="h-6 w-6" />
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
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-slate-200 transition group-hover:bg-accent/20 group-hover:text-accent">
            <SampleMapsIcon className="h-6 w-6" />
          </span>
          <span className="text-sm font-semibold text-slate-100">
            Try these maps
          </span>
          <span className="text-xs text-slate-400">
            Load a ready-made beatmap to explore the editor right away.
          </span>
        </button>
        {onImportSmPack && (
          <button
            type="button"
            onClick={onImportSmPack}
            className="group flex flex-col items-start gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 p-5 text-left transition hover:border-accent/70 hover:bg-ink-700"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-slate-200 transition group-hover:bg-accent/20 group-hover:text-accent">
              <SmPackIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold text-slate-100">
              Import SM pack
            </span>
            <span className="text-xs text-slate-400">
              Browse an Etterna pack folder and open a song in the editor.
            </span>
          </button>
        )}
        {onPackCreator && (
          <button
            type="button"
            onClick={onPackCreator}
            className="group flex flex-col items-start gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 p-5 text-left transition hover:border-accent/70 hover:bg-ink-700"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-ink-600 text-slate-200 transition group-hover:bg-accent/20 group-hover:text-accent">
              <PackCreatorIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold text-slate-100">
              Pack Creator
            </span>
            <span className="text-xs text-slate-400">
              Combine multiple mania maps into one .osz pack.
            </span>
          </button>
        )}
      </div>

      <a
        href="https://discord.gg/aY2UckUxYd"
        target="_blank"
        rel="noreferrer"
        className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-ink-500/60 bg-ink-700/40 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-[#5865F2]/70 hover:bg-ink-700 hover:text-white"
      >
        <DiscordIcon className="h-5 w-5 text-[#5865F2]" />
        Join the Discord Server
      </a>

      {!user && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-ink-600 bg-ink-700/30 px-4 py-3">
          <span className="text-sm text-slate-400">
            Log in with osu! to see your saved maps and mapping invitations.{" "}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap text-slate-500 underline decoration-ink-500 underline-offset-2 transition hover:text-slate-300"
            >
              Privacy policy
            </a>
          </span>
          <Button variant="accent" onClick={login} className="whitespace-nowrap">
            Log in with osu!
          </Button>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
      {localError && <p className="mt-4 text-sm text-rose-400">{localError}</p>}

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
                sourceFormat={p.sourceFormat}
                thumbUrl={localThumbs[p.id]}
                onOpen={() => onOpenLocalProject(p.id)}
                actions={
                  <CardActionButton
                    label="Delete"
                    icon={<TrashIcon className="h-3.5 w-3.5" />}
                    danger
                    busy={busyId === p.id}
                    onClick={() =>
                      setConfirm({ scope: "local", id: p.id, title: p.title })
                    }
                  />
                }
              />
            ))}
          </CardGrid>
        )}
      </Section>

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
              No saved maps yet. Use “Save to cloud” after you start one.
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
                  actions={
                    <CardActionButton
                      label="Delete"
                      icon={<TrashIcon className="h-3.5 w-3.5" />}
                      danger
                      busy={busyId === p.id}
                      onClick={() =>
                        setConfirm({ scope: "cloud", id: p.id, title: p.title })
                      }
                    />
                  }
                />
              ))}
            </CardGrid>
          )}
        </Section>
      )}

      {user && invited.length > 0 && (
        <Section
          title="Mapping invitations"
          hint="maps others shared with you"
          count={invited.length}
        >
          <CardGrid>
            {invited.slice(0, MAX_CARDS).map((p) => {
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
                  actions={
                    <CardActionButton
                      label="Archive"
                      icon={<ArchiveIcon className="h-3.5 w-3.5" />}
                      busy={busyId === p.id}
                      onClick={() => archive(p.id, true)}
                    />
                  }
                />
              );
            })}
          </CardGrid>
        </Section>
      )}

      {user && archivedShared.length > 0 && (
        <section className="mt-6">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="mb-3 flex w-full items-baseline gap-2 border-b border-white/10 pb-1.5 text-left"
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">
              Archived
            </span>
            <span className="grid min-w-[1.25rem] place-items-center rounded-full bg-ink-600 px-1.5 text-[10px] font-semibold text-slate-300">
              {archivedShared.length}
            </span>
            <span className="ml-auto text-[11px] text-slate-500">
              {showArchived ? "Hide ▲" : "Show ▼"}
            </span>
          </button>
          {showArchived && (
            <CardGrid>
              {archivedShared.slice(0, MAX_CARDS).map((p) => (
                <ProjectCard
                  key={p.id}
                  badge="Archived"
                  title={p.title || "Untitled"}
                  subtitle={subtitleOf(p.artist, p.creator)}
                  thumbUrl={p.bg_path ? cloudThumbs[p.bg_path] : undefined}
                  participants={othersOf(p.participants, user.id)}
                  onOpen={() => onOpenCloudProject(p.id)}
                  actions={
                    <CardActionButton
                      label="Unarchive"
                      icon="↩"
                      busy={busyId === p.id}
                      onClick={() => archive(p.id, false)}
                    />
                  }
                />
              ))}
            </CardGrid>
          )}
        </section>
      )}
      </Modal>

      <ConfirmDialog
        open={confirm !== null}
        title="Delete project?"
        message={
          confirm
            ? `“${confirm.title || "Untitled"}” will be permanently deleted. ` +
              (confirm.scope === "local"
                ? "This removes the copy saved in this browser."
                : "This can't be undone.")
            : ""
        }
        confirmLabel="Delete"
        busy={confirmBusy}
        onConfirm={() => void performDelete()}
        onCancel={cancelConfirm}
      />
    </>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.59 5.88997C17.36 5.31997 16.05 4.89997 14.67 4.65997C14.5 4.95997 14.3 5.36997 14.17 5.69997C12.71 5.47997 11.26 5.47997 9.83001 5.69997C9.69001 5.36997 9.49001 4.95997 9.32001 4.65997C7.94001 4.89997 6.63001 5.31997 5.40001 5.88997C2.92001 9.62997 2.25001 13.28 2.58001 16.87C4.23001 18.1 5.82001 18.84 7.39001 19.33C7.78001 18.8 8.12001 18.23 8.42001 17.64C7.85001 17.43 7.31001 17.16 6.80001 16.85C6.94001 16.75 7.07001 16.64 7.20001 16.54C10.33 18 13.72 18 16.81 16.54C16.94 16.65 17.07 16.75 17.21 16.85C16.7 17.16 16.15 17.42 15.59 17.64C15.89 18.23 16.23 18.8 16.62 19.33C18.19 18.84 19.79 18.1 21.43 16.87C21.82 12.7 20.76 9.08997 18.61 5.88997H18.59ZM8.84001 14.67C7.90001 14.67 7.13001 13.8 7.13001 12.73C7.13001 11.66 7.88001 10.79 8.84001 10.79C9.80001 10.79 10.56 11.66 10.55 12.73C10.55 13.79 9.80001 14.67 8.84001 14.67ZM15.15 14.67C14.21 14.67 13.44 13.8 13.44 12.73C13.44 11.66 14.19 10.79 15.15 10.79C16.11 10.79 16.87 11.66 16.86 12.73C16.86 13.79 16.11 14.67 15.15 14.67Z" />
    </svg>
  );
}

function subtitleOf(artist: string, creator: string): string {
  return [artist, creator].filter(Boolean).join(" · ");
}

function othersOf(
  participants: ProjectParticipant[],
  selfId: string,
): ProjectParticipant[] {
  return participants.filter((p) => p.user_id !== selfId);
}

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

function ProjectCard({
  title,
  subtitle,
  note,
  thumbUrl,
  badge,
  sourceFormat,
  participants,
  actions,
  onOpen,
}: {
  title: string;
  subtitle?: string;
  note?: string;
  thumbUrl?: string;
  badge?: string;
  sourceFormat?: "osu" | "sm";
  participants?: ProjectParticipant[];
  actions?: React.ReactNode;
  onOpen: () => void;
}) {
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-xl border border-ink-500/60 bg-ink-700/40 transition hover:border-accent/70 hover:bg-ink-700">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
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
            <div className="grid h-full w-full place-items-center text-slate-600">
              <SampleMapsIcon className="h-8 w-8" />
            </div>
          )}
          {sourceFormat && (
            <img
              src={asset(`${sourceFormat === "sm" ? "etterna-logo" : "osu-logo"}.png`)}
              alt={sourceFormat === "sm" ? "Etterna Map" : "osu! Map"}
              className="absolute left-2 top-2 h-5 w-5 object-contain drop-shadow-md opacity-90"
            />
          )}
          {badge && (
            <span className={`absolute ${sourceFormat ? "left-8" : "left-2"} top-2 rounded-md bg-accent/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow`}>
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
      {actions && (
        <div className="absolute right-2 top-2 z-10 flex gap-1">{actions}</div>
      )}
    </div>
  );
}

function CardActionButton({
  label,
  icon,
  danger,
  busy,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  danger?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={busy}
      data-no-uisound=""
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`grid h-7 w-7 place-items-center rounded-lg bg-ink-900/75 text-sm text-slate-200 shadow backdrop-blur transition disabled:cursor-not-allowed disabled:opacity-50 ${
        danger
          ? "hover:bg-rose-600/85 hover:text-white"
          : "hover:bg-accent/85 hover:text-white"
      }`}
    >
      {busy ? "…" : icon}
    </button>
  );
}

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

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (open) playUiSound("areYouSure");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/72 p-4 backdrop-blur-md"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="flex w-full max-w-sm flex-col overflow-hidden rounded-2xl bg-ink-800 shadow-[0_28px_90px_rgba(0,0,0,0.56)]">
        <header className="border-b border-white/10 bg-ink-700 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
        </header>
        <div className="px-5 py-4 text-sm text-slate-300">{message}</div>
        <footer className="flex justify-end gap-2 border-t border-white/10 bg-ink-700 px-5 py-3.5">
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-lg border border-rose-700/50 bg-rose-600/90 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "…" : confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

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
                    <div className="grid h-full w-full place-items-center text-slate-500">
                      <SampleMapsIcon className="h-7 w-7" />
                    </div>
                  )}
                  <img
                    src={asset(`${map.osz.endsWith(".sm") || map.osz.endsWith(".zip") ? "etterna-logo" : "osu-logo"}.png`)}
                    alt={map.osz.endsWith(".sm") || map.osz.endsWith(".zip") ? "Etterna Map" : "osu! Map"}
                    className="absolute left-2 top-2 h-5 w-5 object-contain drop-shadow-md opacity-90"
                  />
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
