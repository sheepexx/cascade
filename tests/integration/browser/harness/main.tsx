import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AudioSetupModal } from "../../../../src/components/menus/AudioSetupModal";
import { Dropdown, type DropdownOption } from "../../../../src/components/ui/Dropdown";
import { FeedbackInvite } from "../../../../src/app/FeedbackInvite";
import { RatingsOverview, UserRatingsSection } from "../../../../src/components/admin/AdminRatings";
import { useCloudProject } from "../../../../src/app/useCloudProject";
import { useCollabSession } from "../../../../src/app/useCollabSession";
import { useEditHistory } from "../../../../src/app/useEditHistory";
import { initialPlaytestState } from "../../../../src/app/usePlaytest";
import type { ModalId } from "../../../../src/app/appTypes";
import type { AccessRole } from "../../../../src/lib/collab";
import type { AuthUser } from "../../../../src/lib/auth";
import { LocaleProvider, useT } from "../../../../src/lib/i18n";
import type { SampleFile } from "../../../../src/lib/mapSamples";
import type { CollabOp, ManiaNoteLike } from "./types";
import type { BackupReason } from "../../../../src/lib/recovery";
import {
  DEFAULT_SONG_META,
  DEFAULT_VIEW,
  normalizeTimingPoints,
  type BackgroundScope,
  type Difficulty,
  type LoadedFile,
  type ManiaNote,
  type SongMeta,
  type TimingPoint,
  type ViewState,
} from "../../../../src/types";
import { setConnectionLabel, setSupabaseToken } from "../fakeSupabase";
import { SocialOverlay } from "../../../../src/components/social/SocialOverlay";
import { getSocialCounts, type SocialCounts } from "../../../../src/lib/social";
import { parseSocialPath, socialPath, type SocialRoute } from "../../../../src/lib/socialRoute";

/**
 * A page that runs the editor's real collaboration pipeline (the session,
 * undo history and cloud save hooks App wires together) without the editor's
 * canvas, audio and menus, so Playwright can drive it from separate browser
 * contexts. Tests call `window.harness`; see ../harness.ts.
 */

const params = new URLSearchParams(location.search);

function token(userId: string): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode({ alg: "none" })}.${encode({
    sub: userId,
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })}.test`;
}

type Backup = { reason: BackupReason; notes: Record<string, ManiaNote[]>; title: string };

function CollabHarness({ user }: { user: AuthUser }) {
  const t = useT();
  const [meta, setMeta] = useState<SongMeta>(DEFAULT_SONG_META);
  const [timingPoints, setTimingPoints] = useState<TimingPoint[]>([]);
  const [difficulties, setDifficulties] = useState<Difficulty[]>([]);
  const [activeId, setActiveId] = useState("");
  const [view, setView] = useState<ViewState>(DEFAULT_VIEW);
  const [bgScope, setBgScope] = useState<BackgroundScope>("mapset");
  const [audioFiles, setAudioFiles] = useState<Record<string, LoadedFile>>({});
  const [bgFiles, setBgFiles] = useState<Record<string, LoadedFile>>({});
  const [sampleFiles] = useState<Record<string, SampleFile>>({});
  const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
  const [cloudOwnerId, setCloudOwnerId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<AccessRole>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [peerNotice, setPeerNotice] = useState<{ key: number; text: string; avatar: string | null } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalId>(null);
  const [, setImportingMap] = useState(false);
  const [localProjectId, setLocalProjectId] = useState("harness");

  const refs = {
    meta: useRef(meta),
    timingPoints: useRef(timingPoints),
    difficulties: useRef(difficulties),
    activeId: useRef(activeId),
    authUser: useRef<AuthUser | null>(user),
    localProjectId: useRef(localProjectId),
    currentTime: useRef(0),
  };
  refs.meta.current = meta;
  refs.timingPoints.current = timingPoints;
  refs.difficulties.current = difficulties;
  refs.activeId.current = activeId;
  refs.localProjectId.current = localProjectId;

  // Recovery, reduced to what the pipeline reports to it.
  const recovery = useRef({ edits: 0, savedToken: 0, backups: [] as Backup[] });
  const noteRecoveryEdit = useCallback(() => {
    recovery.current.edits += 1;
  }, []);
  const recoverySaveToken = useCallback(() => recovery.current.edits, []);
  const markRecoverySaved = useCallback((_project: string, savedToken: number) => {
    recovery.current.savedToken = Math.max(recovery.current.savedToken, savedToken);
  }, []);
  const backupRecovery = useCallback(async (reason: BackupReason) => {
    recovery.current.backups.push({
      reason,
      title: refs.meta.current.title,
      notes: Object.fromEntries(refs.difficulties.current.map((d) => [d.id, d.notes])),
    });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const session = useCollabSession({
    activeId,
    activeIdRef: refs.activeId,
    audioDuration: 0,
    audioFiles,
    authUser: user,
    authUserRef: refs.authUser,
    backupRecovery,
    bgFiles,
    bgScope,
    cloudOwnerId,
    cloudProjectId,
    currentTimeRef: refs.currentTime,
    difficulties,
    difficultiesRef: refs.difficulties,
    invisibleMode: false,
    localProjectIdRef: refs.localProjectId,
    markRecoverySaved,
    meta,
    metaRef: refs.meta,
    myRole,
    noteRecoveryEdit,
    playtest: initialPlaytestState(),
    recoverySaveToken,
    seekAudio: () => {},
    setActiveId,
    setAudioFiles,
    setBgFiles,
    setCloudError,
    setDifficulties,
    setMeta,
    setMyRole,
    setPeerNotice,
    setTimingPoints,
    t,
    timingPoints,
    timingPointsRef: refs.timingPoints,
    view,
  });

  const history = useEditHistory({
    applyingRemoteRef: session.applyingRemoteRef,
    canEditRef: session.canEditRef,
    collabRef: session.collabRef,
    difficulties,
    historyPanel: false,
    liveEnabled: session.liveEnabled,
    markStructural: session.markStructural,
    meta,
    modal,
    noteRecoveryEdit,
    onKeptChanges: (count) => setNotice(t("history.keptCollaboratorChanges", { count })),
    opRedoRef: session.opRedoRef,
    opUndoRef: session.opUndoRef,
    sessionActiveRef: session.sessionActiveRef,
    setActiveId,
    setDifficulties,
    setMeta,
    setTimingPoints,
    t,
    timingPoints,
  });

  const replaceProject = useCallback(
    (next: { meta: SongMeta; timingPoints: TimingPoint[]; difficulties: Difficulty[]; activeId?: string; localProjectId?: string }) => {
      history.applyingHistoryRef.current = true;
      setMeta(next.meta);
      setTimingPoints(normalizeTimingPoints(next.timingPoints));
      const diffs = next.difficulties.map((d) => ({ ...d, timingPoints: normalizeTimingPoints(d.timingPoints) }));
      setDifficulties(diffs);
      setActiveId(diffs.some((d) => d.id === next.activeId) ? (next.activeId as string) : diffs[0]?.id ?? "");
      setCloudProjectId(null);
      setCloudOwnerId(null);
      setMyRole(null);
      setLocalProjectId(next.localProjectId ?? "harness");
    },
    [history.applyingHistoryRef],
  );

  const cloud = useCloudProject({
    activeId,
    assetAttemptsRef: session.assetAttemptsRef,
    audioFiles,
    authUser: user,
    authUserRef: refs.authUser,
    bgFiles,
    bgScope,
    cloudProjectId,
    cloudSync: session.cloudSync,
    difficulties,
    localEditVersionRef: session.localEditVersionRef,
    localProjectId,
    markRecoverySaved,
    meta,
    opRedoRef: session.opRedoRef,
    opUndoRef: session.opUndoRef,
    pendingDocSyncRef: session.pendingDocSyncRef,
    pendingSeekRef: session.pendingSeekRef,
    publishedAssetBlobsRef: session.publishedAssetBlobsRef,
    recoverySaveToken,
    refreshAuth: async () => {},
    replaceProject,
    sampleFiles,
    setBgScope,
    setCloudError,
    setCloudOwnerId,
    setCloudProjectId,
    setImportingMap,
    setModal,
    setMyRole,
    setView,
    timingPoints,
    view,
  });

  const latest = useRef({ session, history, cloud });
  latest.current = { session, history, cloud };

  const projectToOpen = params.get("project");
  useEffect(() => {
    if (projectToOpen) void latest.current.cloud.loadCloudProject(projectToOpen);
  }, [projectToOpen]);

  useEffect(() => {
    const find = (id: string) =>
      refs.difficulties.current.find((d) => d.id === refs.activeId.current)?.notes.find((n) => n.id === id);
    window.harness = {
      state: () => ({
        ready:
          !!refs.difficulties.current.length &&
          latest.current.session.collab.status === "connected" &&
          latest.current.session.cloudSync.revision !== null,
        status: latest.current.session.collab.status,
        role: myRole,
        canEdit: latest.current.session.canEditRef.current,
        title: refs.meta.current.title,
        notes: Object.fromEntries(
          refs.difficulties.current.map((d) => [d.id, [...d.notes].sort((a, b) => a.id.localeCompare(b.id))]),
        ),
        activeId: refs.activeId.current,
        cloudError,
        notice,
        peerNotice: peerNotice?.text ?? null,
        revision: latest.current.session.cloudSync.revision,
        unsaved: !latest.current.session.cloudSync.isSaved(latest.current.session.localEditVersionRef.current),
        recoveryUnsaved: recovery.current.savedToken < recovery.current.edits,
        backups: recovery.current.backups,
        saveStatus: latest.current.cloud.cloudSaveStatus,
      }),
      addNote: (note: ManiaNoteLike) =>
        latest.current.session.commitNoteOp({ t: "note.add", diffId: refs.activeId.current, notes: [note] }),
      moveNote: (id: string, changes: Partial<ManiaNoteLike>) => {
        const before = find(id);
        if (!before) throw new Error(`no note ${id}`);
        latest.current.session.commitNoteOp({
          t: "note.update",
          diffId: refs.activeId.current,
          before: [before],
          after: [{ ...before, ...changes }],
        });
      },
      removeNote: (id: string) => {
        const note = find(id);
        if (!note) throw new Error(`no note ${id}`);
        latest.current.session.commitNoteOp({ t: "note.remove", diffId: refs.activeId.current, notes: [note] });
      },
      setTitle: (title: string) => latest.current.session.updateMeta({ ...refs.meta.current, title }),
      undo: () => latest.current.history.undo(),
      redo: () => latest.current.history.redo(),
      save: () => latest.current.cloud.handleCloudSave(),
      sendRawOp: (op: CollabOp) => latest.current.session.collabRef.current?.sendOp(op as never),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloudError, notice, peerNotice, myRole]);

  return (
    <pre data-testid="state">
      {JSON.stringify({ status: session.collab.status, role: myRole, cloudError, notice })}
    </pre>
  );
}

/** Audio setup as the browser build shows it, where WASAPI exclusive is disabled. */
function AudioSetupHarness() {
  const [exclusive, setExclusive] = useState(false);
  return (
    <>
      <output data-testid="mode">{exclusive ? "exclusive" : "shared"}</output>
      <AudioSetupModal
        exclusive={exclusive}
        onExclusive={setExclusive}
        currentOffset={0}
        onApplyOffset={() => {}}
        onClose={() => {}}
      />
    </>
  );
}

const LISTS: Record<string, DropdownOption<string>[]> = {
  mixed: [
    { value: "a", label: "Alpha", disabled: true },
    { value: "b", label: "Bravo" },
    { value: "c", label: "Charlie", disabled: true },
    { value: "d", label: "Delta" },
    { value: "e", label: "Echo" },
    { value: "f", label: "Foxtrot", disabled: true },
  ],
  disabled: [
    { value: "a", label: "Alpha", disabled: true },
    { value: "b", label: "Bravo", disabled: true },
  ],
  empty: [],
};

/** A bare dropdown over a list with disabled rows, for keyboard tests. */
function DropdownHarness() {
  const list = LISTS[params.get("list") ?? "mixed"] ?? [];
  const [value, setValue] = useState(params.get("value") ?? list.find((o) => !o.disabled)?.value ?? "");
  return (
    <>
      <output data-testid="value">{value}</output>
      <Dropdown aria-label="Test list" value={value} options={list} onChange={setValue} />
    </>
  );
}

/** The feedback invitation with the editor's signals as buttons. */
function FeedbackInviteHarness() {
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState(false);
  const [taskKey, setTaskKey] = useState(0);
  const [shared, setShared] = useState(0);
  return (
    <>
      <button type="button" onClick={() => setTaskKey((key) => key + 1)}>Finish export</button>
      <button type="button" onClick={() => setBusy((value) => !value)}>Toggle playback</button>
      <button type="button" onClick={() => setDialog((value) => !value)}>Toggle dialog</button>
      <output data-testid="shared">{shared}</output>
      {dialog && <div role="dialog" aria-label="Some dialog" />}
      <div className="fixed bottom-4 left-4">
        <FeedbackInvite
          busy={busy}
          activity={null}
          taskKey={taskKey}
          troubled={false}
          userId={params.get("user")}
          onShare={() => setShared((count) => count + 1)}
        />
      </div>
    </>
  );
}

/** The admin panel's rating views, as an admin sees them. */
function AdminRatingsHarness() {
  const profile = params.get("profile");
  return (
    <div className="min-h-screen bg-ink-900 p-6 text-slate-100">
      <RatingsOverview />
      {profile && <UserRatingsSection userId={profile} />}
    </div>
  );
}

/**
 * The social overlay as the app opens it, signed in as the page's user. The
 * route lives in the address bar like the app's; counts refresh after every
 * action and on a "Refresh counts" button tests can press.
 */
function SocialHarness() {
  const [route, setRoute] = useState<SocialRoute>(
    // A reload comes back to where the window had moved to.
    () =>
      parseSocialPath(location.hash.slice(1)) ??
      parseSocialPath(params.get("route") ?? "/community") ?? { view: "community" },
  );
  const [counts, setCounts] = useState<SocialCounts>({ unread_messages: 0, pending_requests: 0 });
  const [refreshKey, setRefreshKey] = useState(0);
  const [imported, setImported] = useState<number | null>(null);
  const refreshCounts = useCallback(() => {
    void getSocialCounts().then(setCounts).catch(() => {});
  }, []);
  useEffect(refreshCounts, [refreshCounts]);
  const navigate = useCallback((next: SocialRoute) => {
    window.history.replaceState(null, "", `/?${params.toString()}#${socialPath(next)}`);
    setRoute(next);
  }, []);
  return (
    <div className="min-h-screen bg-ink-900">
      <button
        type="button"
        className="fixed left-2 top-2 z-[70] text-xs text-slate-500"
        onClick={() => {
          refreshCounts();
          setRefreshKey((key) => key + 1);
        }}
      >
        Refresh counts
      </button>
      <output data-testid="counts" className="sr-only">{`${counts.unread_messages}/${counts.pending_requests}`}</output>
      <output data-testid="imported" className="sr-only">{imported ?? ""}</output>
      <SocialOverlay
        open
        route={route}
        counts={counts}
        refreshKey={refreshKey}
        onNavigate={navigate}
        onClose={() => {}}
        onCountsChanged={refreshCounts}
        onOpenPrivacy={() => {}}
        onOpenCloudProject={() => {}}
        onOpenBeatmapset={setImported}
      />
    </div>
  );
}

function Harness() {
  if (params.get("mode") === "social") return <SocialHarness />;
  if (params.get("mode") === "audio-setup") return <AudioSetupHarness />;
  if (params.get("mode") === "admin-ratings") return <AdminRatingsHarness />;
  if (params.get("mode") === "feedback-invite") return <FeedbackInviteHarness />;
  if (params.get("mode") === "dropdown") return <DropdownHarness />;
  const userId = params.get("user") ?? "";
  const user: AuthUser = {
    id: userId,
    osu_id: 1,
    username: params.get("name") ?? "tester",
    avatar_url: null,
    is_admin: false,
  };
  return <CollabHarness user={user} />;
}


const userId = params.get("user");
if (userId) setSupabaseToken(token(userId));
setConnectionLabel(params.get("label") ?? params.get("name") ?? "");

// The editor's styles, for pages a test looks at rather than only drives;
// rendering waits for them so a screenshot never catches the page bare.
const styles = params.get("styled") ? import("../../../../src/index.css") : Promise.resolve();
void styles.then(() =>
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <LocaleProvider>
        <Harness />
      </LocaleProvider>
    </StrictMode>,
  ),
);
