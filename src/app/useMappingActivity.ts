import { useCallback, useEffect, useRef } from "react";
import type { AuthUser } from "../lib/auth";
import {
  MappingReporter,
  MappingTracker,
  type MappingContext,
  type MappingReport,
} from "../lib/mappingTracker";
import { recordMappingActivity } from "../lib/mappingStatsApi";
import { onMappingEvent } from "../lib/mappingEvents";
import type { Difficulty, SongMeta, TimingPoint } from "../types";
import type { ModalId } from "./appTypes";

const TICK_MS = 1000;
const FLUSH_MS = 60_000;
const STORAGE_PREFIX = "cascade:mapping-reports:";

/** Dialogs that are part of editing a map; anything else pauses the clock. */
const EDITING_MODALS = new Set<ModalId>([
  "mapSettings",
  "timing",
  "sv",
  "difficulty",
  "tools",
  "aimod",
  "history",
]);

function storageFor(userId: string) {
  const key = STORAGE_PREFIX + userId;
  return {
    load: (): MappingReport[] => {
      try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(parsed) ? (parsed as MappingReport[]) : [];
      } catch {
        return [];
      }
    },
    save: (reports: MappingReport[]) => {
      try {
        if (reports.length) localStorage.setItem(key, JSON.stringify(reports));
        else localStorage.removeItem(key);
      } catch {
        // Storage full or blocked: the reports stay in memory for this tab.
      }
    },
  };
}

function safeKey(raw: string): string {
  return raw.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 64) || "unknown";
}

function uninheritedCount(points: readonly TimingPoint[]): number {
  let n = 0;
  for (const p of points) if (p.uninherited) n++;
  return n;
}

/**
 * Feeds the mapping-time tracker (lib/mappingTracker) from the editor and
 * sends what it counts. All of it lives in refs and plain listeners, so the
 * editor never re-renders for it; the per-edit work is a length comparison.
 */
export function useMappingActivity({
  authUser,
  enabled,
  hasProject,
  cloudProjectId,
  localProjectId,
  meta,
  activeDifficulty,
  difficulties,
  timingPoints,
  modal,
  socialOpen,
  playtesting,
  playing,
  isRemoteChange,
}: {
  authUser: AuthUser | null;
  enabled: boolean;
  hasProject: boolean;
  cloudProjectId: string | null;
  localProjectId: string;
  meta: SongMeta;
  activeDifficulty: Difficulty | null;
  difficulties: Difficulty[];
  timingPoints: TimingPoint[];
  modal: ModalId;
  socialOpen: boolean;
  playtesting: boolean;
  playing: boolean;
  /** True while the change being rendered came from a collaborator, undo or redo. */
  isRemoteChange: () => boolean;
}) {
  const trackerRef = useRef<MappingTracker | null>(null);
  if (!trackerRef.current) trackerRef.current = new MappingTracker();
  const reporterRef = useRef<MappingReporter | null>(null);
  const active = enabled && !!authUser;
  const userId = authUser?.id ?? null;
  const stateRef = useRef({ hasProject, modal, socialOpen, playtesting, playing });
  stateRef.current = { hasProject, modal, socialOpen, playtesting, playing };
  const pendingCreated = useRef(false);

  const projectKey = hasProject
    ? cloudProjectId
      ? `cloud:${cloudProjectId}`
      : `local:${safeKey(localProjectId)}`
    : null;

  const eligible = useCallback(() => {
    const s = stateRef.current;
    return (
      s.hasProject &&
      !s.socialOpen &&
      (s.modal === null || EDITING_MODALS.has(s.modal) || s.playtesting) &&
      document.visibilityState === "visible" &&
      document.hasFocus()
    );
  }, []);

  // One reporter per account; whatever a previous account left unsent stays
  // in its own storage until it signs in again.
  useEffect(() => {
    if (!active || !userId) {
      reporterRef.current = null;
      return;
    }
    const reporter = new MappingReporter(
      async (report) => {
        await recordMappingActivity(report);
      },
      storageFor(userId),
    );
    reporterRef.current = reporter;
    void reporter.flush();
    return () => {
      reporter.enqueue(trackerRef.current?.drain() ?? []);
      void reporter.flush();
      if (reporterRef.current === reporter) reporterRef.current = null;
    };
  }, [active, userId]);

  // What is being worked on.
  const context: MappingContext | null = projectKey
    ? {
        projectKey,
        projectTitle: meta.title.trim().slice(0, 200),
        projectArtist: meta.artist.trim().slice(0, 200),
        beatmapsetId: meta.beatmapSetId && meta.beatmapSetId > 0 ? meta.beatmapSetId : null,
        difficultyKey: activeDifficulty ? safeKey(activeDifficulty.id) : null,
        difficultyName: activeDifficulty?.name.slice(0, 120) ?? null,
      }
    : null;
  const contextSignature = context ? JSON.stringify(context) : "";
  useEffect(() => {
    const tracker = trackerRef.current!;
    tracker.setContext(context);
    if (context && pendingCreated.current) {
      pendingCreated.current = false;
      tracker.count("maps_created", Date.now());
    }
    // contextSignature stands in for the object, which is new every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextSignature]);

  // The clock, input listeners and the minute-by-minute report.
  useEffect(() => {
    if (!active) return;
    const tracker = trackerRef.current!;
    const onInput = () => {
      if (eligible()) tracker.input(Date.now());
    };
    const tick = window.setInterval(() => {
      const s = stateRef.current;
      tracker.tick({ eligible: eligible(), playtesting: s.playtesting, playing: s.playing }, Date.now());
    }, TICK_MS);
    const flush = () => {
      const reporter = reporterRef.current;
      if (!reporter) return;
      reporter.enqueue(tracker.drain());
      void reporter.flush();
    };
    const report = window.setInterval(flush, FLUSH_MS);
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("keydown", onInput, true);
    window.addEventListener("pointerdown", onInput, true);
    window.addEventListener("wheel", onInput, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(report);
      window.removeEventListener("keydown", onInput, true);
      window.removeEventListener("pointerdown", onInput, true);
      window.removeEventListener("wheel", onInput, { capture: true });
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [active, eligible]);

  // Edits to the open map: note counts on the active difficulty, timing and
  // SV changes, and new empty difficulties. Changes from collaborators, undo
  // and redo, or another map loading in, aren't this mapper's new work.
  const baseline = useRef<{
    project: string | null;
    difficultyId: string | null;
    notes: number;
    difficulties: number;
    timing: readonly TimingPoint[];
    uninherited: number;
  } | null>(null);
  const activeId = activeDifficulty?.id ?? null;
  const noteCount = activeDifficulty?.notes.length ?? 0;
  useEffect(() => {
    const previous = baseline.current;
    const next = {
      project: projectKey,
      difficultyId: activeId,
      notes: noteCount,
      difficulties: difficulties.length,
      timing: timingPoints,
      uninherited: previous && previous.timing === timingPoints ? previous.uninherited : uninheritedCount(timingPoints),
    };
    baseline.current = next;
    if (!active || !previous || !projectKey || previous.project !== projectKey || isRemoteChange()) return;
    const tracker = trackerRef.current!;
    const now = Date.now();
    let edited = false;
    if (previous.difficultyId === activeId && noteCount !== previous.notes) {
      if (noteCount > previous.notes) tracker.count("notes_placed", now, noteCount - previous.notes);
      else tracker.count("notes_deleted", now, previous.notes - noteCount);
      edited = true;
    }
    if (previous.timing !== timingPoints) {
      tracker.count(next.uninherited !== previous.uninherited || timingChangedUninherited(previous.timing, timingPoints) ? "timing_changes" : "sv_changes", now);
      edited = true;
    }
    if (difficulties.length > previous.difficulties) {
      const fresh = difficulties.slice(previous.difficulties).filter((d) => d.notes.length === 0).length;
      if (fresh > 0) tracker.count("difficulties_created", now, fresh);
      edited = true;
    }
    if (edited && eligible()) tracker.input(now);
    // isRemoteChange is read at effect time, which is the point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, projectKey, activeId, noteCount, difficulties.length, timingPoints]);

  // Playtest starts count as sessions.
  const wasPlaytesting = useRef(playtesting);
  useEffect(() => {
    if (playtesting && !wasPlaytesting.current && active) trackerRef.current!.count("playtests", Date.now());
    wasPlaytesting.current = playtesting;
  }, [playtesting, active]);

  // Exports count against the open map; a new map counts once it is open.
  useEffect(
    () =>
      onMappingEvent((event) => {
        if (event === "export") trackerRef.current?.count("exports", Date.now());
        else pendingCreated.current = true;
      }),
    [],
  );
}

/**
 * Whether a timing change touched red (uninherited) lines, compared by
 * reference: the editor replaces only the points it changes.
 */
function timingChangedUninherited(before: readonly TimingPoint[], after: readonly TimingPoint[]): boolean {
  const old = new Set(before.filter((p) => p.uninherited));
  for (const p of after) {
    if (p.uninherited && !old.has(p)) return true;
  }
  return false;
}
