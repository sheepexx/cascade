import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCollab } from "../hooks/useCollab";
import type { AssetChange, ProjectSyncChange } from "../hooks/useCollab";
import type { AudioSeekTransition } from "../lib/audioSeek";
import type { AuthUser } from "../lib/auth";
import {
  loadProjectAssets,
  loadProjectChartCloud,
  publishProjectAsset,
  saveProjectDataCloud,
} from "../lib/cloud";
import { InvalidChartDataError } from "../lib/chartValidation";
import { mergeDifficulties, mergeMeta, mergeTimingPoints } from "../lib/chartMerge";
import { CloudSync, normalizedChart, type CloudSyncHost } from "../lib/cloudSync";
import type { BackupReason } from "../lib/recovery";
import type { AccessRole } from "../lib/collab";
import { myAccess } from "../lib/collab";
import type { Translate } from "../lib/i18n";
import type { CollabOp, DiffFieldOp, NoteOp } from "../lib/ops";
import { applyDiffFieldOp, applyNoteOp, applyOp, opProblem } from "../lib/ops";
import { subscribeSupabase } from "../lib/supabase";
import type {
  BackgroundScope,
  Difficulty,
  LoadedFile,
  SongMeta,
  TimingPoint,
  ViewState,
} from "../types";
import type { PlaytestRuntimeState } from "./usePlaytest";

/** How often a trim or fade drag reaches collaborators while it moves. */
const TRIM_BROADCAST_MS = 90;

/**
 * The edit pipeline and, for a cloud map, the live session around it.
 *
 * Every local change goes through here: markStructural counts it (for the
 * recovery copy and the cloud sync), commitNoteOp applies a note edit and,
 * in a live session, broadcasts it as an op with its own undo stack, and
 * commitDiffFields throttles trim and fade drags into a few broadcasts.
 *
 * For a cloud map it also keeps the realtime channel, merges collaborators'
 * ops and saved revisions, saves the document a moment after each change,
 * publishes and fetches audio and backgrounds, follows the caller's role,
 * shares the playhead with peers and remembers where each map was left.
 *
 * Saving and merging saved revisions go through one CloudSync (lib/cloudSync):
 * each save names the revision it was edited from, a save someone else beat
 * is merged and saved again rather than written over theirs, and a change
 * counts as saved only once the cloud has it.
 */
export function useCollabSession({
  activeId,
  activeIdRef,
  audioDuration,
  audioFiles,
  authUser,
  authUserRef,
  backupRecovery,
  bgFiles,
  bgScope,
  cloudOwnerId,
  cloudProjectId,
  currentTimeRef,
  difficulties,
  difficultiesRef,
  invisibleMode,
  localProjectIdRef,
  markRecoverySaved,
  meta,
  metaRef,
  myRole,
  noteRecoveryEdit,
  playtest,
  recoverySaveToken,
  seekAudio,
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
  timingPointsRef,
  view,
}: {
  activeId: string;
  activeIdRef: MutableRefObject<string>;
  audioDuration: number;
  audioFiles: Record<string, LoadedFile>;
  authUser: AuthUser | null;
  authUserRef: MutableRefObject<AuthUser | null>;
  backupRecovery: (reason: BackupReason) => Promise<boolean>;
  bgFiles: Record<string, LoadedFile>;
  bgScope: BackgroundScope;
  cloudOwnerId: string | null;
  cloudProjectId: string | null;
  currentTimeRef: MutableRefObject<number>;
  difficulties: Difficulty[];
  difficultiesRef: MutableRefObject<Difficulty[]>;
  invisibleMode: boolean;
  localProjectIdRef: MutableRefObject<string>;
  markRecoverySaved: (forProject: string, token: number) => void;
  meta: SongMeta;
  metaRef: MutableRefObject<SongMeta>;
  myRole: AccessRole;
  noteRecoveryEdit: (forProject?: string) => void | undefined;
  playtest: PlaytestRuntimeState;
  recoverySaveToken: () => number;
  seekAudio: (time: number, transition?: AudioSeekTransition) => void;
  setActiveId: Dispatch<SetStateAction<string>>;
  setAudioFiles: Dispatch<SetStateAction<Record<string, LoadedFile>>>;
  setBgFiles: Dispatch<SetStateAction<Record<string, LoadedFile>>>;
  setCloudError: Dispatch<SetStateAction<string | null>>;
  setDifficulties: Dispatch<SetStateAction<Difficulty[]>>;
  setMeta: Dispatch<SetStateAction<SongMeta>>;
  setMyRole: Dispatch<SetStateAction<AccessRole>>;
  setPeerNotice: Dispatch<SetStateAction<{ key: number; text: string; avatar: string | null; } | null>>;
  setTimingPoints: Dispatch<SetStateAction<TimingPoint[]>>;
  t: Translate;
  timingPoints: TimingPoint[];
  timingPointsRef: MutableRefObject<TimingPoint[]>;
  view: ViewState;
}) {
  const cloudProjectIdRef = useRef(cloudProjectId);
  cloudProjectIdRef.current = cloudProjectId;

  const liveEnabled = !!cloudProjectId && !!authUser;
  const canEdit =
    !playtest.active &&
    (!cloudProjectId || myRole === "owner" || myRole === "editor");
  const sessionActiveRef = useRef(false);
  sessionActiveRef.current = liveEnabled;
  const canEditRef = useRef(true);
  canEditRef.current = canEdit;

  const applyingRemoteRef = useRef(false);
  const opUndoRef = useRef<NoteOp[]>([]);
  const opRedoRef = useRef<NoteOp[]>([]);
  const pendingDiffOpRef = useRef<DiffFieldOp | null>(null);
  const lastDiffOpSendRef = useRef(0);
  const diffOpTimerRef = useRef<number | null>(null);
  const pendingDocSyncRef = useRef(false);
  const cloudSyncTimerRef = useRef<number | null>(null);
  const localEditVersionRef = useRef(0);
  const collabRef = useRef<ReturnType<typeof useCollab> | null>(null);
  const publishedAssetBlobsRef = useRef<Map<string, Blob>>(new Map());
  const assetPublishPromiseRef = useRef<Promise<void>>(Promise.resolve());
  const viewRef = useRef(view);
  viewRef.current = view;
  const bgScopeRef = useRef(bgScope);
  bgScopeRef.current = bgScope;
  const backupRecoveryRef = useRef(backupRecovery);
  backupRecoveryRef.current = backupRecovery;
  /** The save error this hook is showing, so a later save can clear just that. */
  const liveSaveErrorRef = useRef<string | null>(null);
  const tRef = useRef(t);
  tRef.current = t;
  const [assetPublishTick, setAssetPublishTick] = useState(0);
  const [assetSyncTick, setAssetSyncTick] = useState(0);
  const assetAttemptsRef = useRef<Map<string, number>>(new Map());
  const forcedAssetReloadsRef = useRef<Set<string>>(new Set());
  const pendingSeekRef = useRef<number | null>(null);
  const [cloudSyncRetry, setCloudSyncRetry] = useState(0);

  const markStructural = useCallback(() => {
    localEditVersionRef.current += 1;
    if (sessionActiveRef.current) pendingDocSyncRef.current = true;
    noteRecoveryEdit();
  }, [noteRecoveryEdit]);

  useEffect(() => {
    if (!cloudProjectId || !authUser) return;
    if (cloudOwnerId === authUser.id) {
      setMyRole("owner");
      return;
    }
    return subscribeSupabase((supabase) =>
      supabase
        .channel(`collab:${cloudProjectId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "project_collaborators",
            filter: `project_id=eq.${cloudProjectId}`,
          },
          () => {
            myAccess(cloudProjectId, authUser.id)
              .then(setMyRole)
              .catch(() => {});
          },
        )
        .subscribe(),
    );
  }, [cloudProjectId, cloudOwnerId, authUser, setMyRole]);

  const showPeerNotice = useCallback((text: string, avatar: string | null) => {
    setPeerNotice({ key: Date.now(), text, avatar });
  }, [setPeerNotice]);

  const applyRemoteOp = useCallback((op: CollabOp) => {
    // An op that can't fit this map (a column past its key count) is refused
    // and reported; the sender's next saved snapshot is checked again on load.
    if (opProblem(op, difficultiesRef.current) === "column") {
      console.warn("[collab] ignored an op that does not fit this map", op);
      showPeerNotice(t("collab.invalidOpIgnored"), null);
      return;
    }
    applyingRemoteRef.current = true;
    setDifficulties((prev) => (opProblem(op, prev) ? prev : applyOp(prev, op)));
  }, [difficultiesRef, setDifficulties, showPeerNotice, t]);
  const cloudSyncRef = useRef<CloudSync | null>(null);
  if (!cloudSyncRef.current) {
    const host: CloudSyncHost = {
      read: () => ({
        chart: {
          meta: metaRef.current,
          timingPoints: timingPointsRef.current,
          difficulties: difficultiesRef.current,
        },
        extra: {
          activeId: activeIdRef.current,
          view: viewRef.current,
          bgScope: bgScopeRef.current,
        },
        editVersion: localEditVersionRef.current,
      }),
      // Each part merges again against the editor's newest state, in case a
      // collaborator's op or a local edit landed since `local` was read.
      apply: ({ base, remote, local, merged }) => {
        applyingRemoteRef.current = true;
        setMeta((prev) =>
          prev === local.meta ? merged.meta : mergeMeta(base?.meta, prev, remote.meta).value,
        );
        setTimingPoints((prev) =>
          prev === local.timingPoints
            ? merged.timingPoints
            : mergeTimingPoints(base?.timingPoints, prev, remote.timingPoints).value,
        );
        setDifficulties((prev) =>
          prev === local.difficulties
            ? merged.difficulties
            : mergeDifficulties(base?.difficulties, prev, remote.difficulties).value,
        );
        setActiveId((cur) =>
          merged.difficulties.some((d) => d.id === cur) ? cur : merged.difficulties[0]?.id ?? cur,
        );
      },
      keepLocalCopy: async (conflicts) => {
        await backupRecoveryRef.current("before-merge");
        setCloudError(tRef.current("cloud.mergedConflicts", { count: conflicts }));
      },
    };
    cloudSyncRef.current = new CloudSync(host, async () => {
      const pid = cloudProjectIdRef.current;
      if (!pid) throw new Error("no cloud project is open");
      const snapshot = await loadProjectChartCloud(pid);
      return { ...snapshot, data: { ...snapshot.data, ...normalizedChart(snapshot.data) } };
    });
  }
  const cloudSync = cloudSyncRef.current;

  const refreshFromCloud = useCallback((change?: ProjectSyncChange) => {
    if (!cloudProjectIdRef.current) return;
    void cloudSync.refresh(change).catch((error: unknown) => {
      // A snapshot that fails its checks is reported and left out; anything
      // else (offline, a closed map) waits for the next change or save.
      if (error instanceof InvalidChartDataError) setCloudError(error.message);
    });
  }, [cloudSync, setCloudError]);

  const collab = useCollab({
    projectId: cloudProjectId,
    enabled: liveEnabled,
    invisible: invisibleMode,
    me: authUser
      ? { id: authUser.id, username: authUser.username, avatar: authUser.avatar_url }
      : null,
    onRemoteOp: applyRemoteOp,
    onRefresh: refreshFromCloud,
    onAssetChange: useCallback((change: AssetChange) => {
      if (change.filename) {
        forcedAssetReloadsRef.current.add(change.filename);
        assetAttemptsRef.current.delete(change.filename);
      }
      setAssetSyncTick((tick) => tick + 1);
    }, []),
    onPeerJoin: useCallback(
      (p: { username: string; avatar: string | null }) =>
        showPeerNotice(`${p.username} joined the session`, p.avatar),
      [showPeerNotice],
    ),
    onPeerLeave: useCallback(
      (p: { username: string; avatar: string | null }) =>
        showPeerNotice(`${p.username} left`, p.avatar),
      [showPeerNotice],
    ),
    onNotice: useCallback(
      (n: { text: string; avatar: string | null }) =>
        showPeerNotice(n.text, n.avatar),
      [showPeerNotice],
    ),
  });
  collabRef.current = collab;

  const commitNoteOp = useCallback((op: NoteOp) => {
    if (!canEditRef.current) return;
    markStructural();
    setDifficulties((prev) => applyNoteOp(prev, op));
    if (sessionActiveRef.current) {
      opUndoRef.current.push(op);
      if (opUndoRef.current.length > 300) opUndoRef.current.shift();
      opRedoRef.current = [];
      collabRef.current?.sendOp(op);
    }
  }, [markStructural, setDifficulties]);

  const flushDiffOp = useCallback(() => {
    if (diffOpTimerRef.current !== null) {
      window.clearTimeout(diffOpTimerRef.current);
      diffOpTimerRef.current = null;
    }
    const op = pendingDiffOpRef.current;
    pendingDiffOpRef.current = null;
    if (!op) return;
    lastDiffOpSendRef.current = Date.now();
    collabRef.current?.sendOp(op);
  }, []);

  const commitDiffFields = useCallback(
    (fields: Partial<Record<keyof DiffFieldOp["fields"], number | null>>) => {
      if (!canEditRef.current) return;
      markStructural();
      const diffId = activeIdRef.current;
      const op: DiffFieldOp = { t: "diff.fields", diffId, fields };
      setDifficulties((prev) => applyDiffFieldOp(prev, op));
      if (!sessionActiveRef.current) return;
      const prevOp = pendingDiffOpRef.current;
      pendingDiffOpRef.current =
        prevOp && prevOp.diffId === diffId
          ? { t: "diff.fields", diffId, fields: { ...prevOp.fields, ...fields } }
          : op;
      const elapsed = Date.now() - lastDiffOpSendRef.current;
      if (elapsed >= TRIM_BROADCAST_MS) {
        flushDiffOp();
      } else if (diffOpTimerRef.current === null) {
        diffOpTimerRef.current = window.setTimeout(
          flushDiffOp,
          TRIM_BROADCAST_MS - elapsed,
        );
      }
    },
    [flushDiffOp, markStructural, activeIdRef, setDifficulties],
  );

  const announceAssetChange = useCallback((action: string) => {
    if (!sessionActiveRef.current) return;
    const name = authUserRef.current?.username ?? "A collaborator";
    collabRef.current?.sendNotice(`${name} ${action}`);
  }, [authUserRef]);

  const updateMeta = useCallback(
    (m: SongMeta) => {
      if (!canEditRef.current) return;
      markStructural();
      setMeta(m);
    },
    [markStructural, setMeta],
  );

  useEffect(() => {
    if (liveEnabled) collabRef.current?.updatePresence({ activeDiffId: activeId });
  }, [activeId, liveEnabled]);

  useEffect(() => {
    if (!liveEnabled) return;
    const id = window.setInterval(() => {
      collabRef.current?.updatePresence({
        playheadMs: Math.round(currentTimeRef.current),
      });
    }, 500);
    return () => window.clearInterval(id);
  }, [liveEnabled, currentTimeRef]);

  useEffect(() => {
    if (!cloudProjectId) return;
    const savePosition = () => {
      try {
        localStorage.setItem(
          `mania:pos:${cloudProjectId}`,
          JSON.stringify({
            activeId,
            playheadMs: Math.round(currentTimeRef.current),
          }),
        );
      } catch {
      }
    };
    const id = window.setInterval(savePosition, 1000);
    return () => {
      window.clearInterval(id);
      savePosition();
    };
  }, [cloudProjectId, activeId, currentTimeRef]);

  useEffect(() => {
    if (pendingSeekRef.current != null && audioDuration > 0) {
      seekAudio(Math.min(pendingSeekRef.current, audioDuration));
      pendingSeekRef.current = null;
    }
  }, [audioDuration, seekAudio]);

  useEffect(() => {
    if (!cloudProjectId || !liveEnabled || !canEdit) return;
    const pending: { kind: "audio" | "bg"; file: LoadedFile }[] = [];
    for (const f of Object.values(audioFiles))
      if (publishedAssetBlobsRef.current.get(`audio:${f.name}`) !== f.blob)
        pending.push({ kind: "audio", file: f });
    for (const f of Object.values(bgFiles))
      if (publishedAssetBlobsRef.current.get(`bg:${f.name}`) !== f.blob)
        pending.push({ kind: "bg", file: f });
    if (!pending.length) return;

    const publish = async () => {
      for (const { kind, file } of pending) {
        const key = `${kind}:${file.name}`;
        if (publishedAssetBlobsRef.current.get(key) === file.blob) continue;
        let published = false;
        let lastError: unknown;
        for (let attempt = 0; attempt < 3 && !published; attempt += 1) {
          try {
            await publishProjectAsset(cloudProjectId, kind, {
              name: file.name,
              blob: file.blob,
            });
            publishedAssetBlobsRef.current.set(key, file.blob);
            published = true;
          } catch (error) {
            lastError = error;
            if (attempt < 2)
              await new Promise((resolve) =>
                window.setTimeout(resolve, 500 * 2 ** attempt),
              );
          }
        }
        if (!published) throw lastError;
      }
    };
    const queued = assetPublishPromiseRef.current.catch(() => {}).then(publish);
    assetPublishPromiseRef.current = queued;
    let retryTimer: number | undefined;
    let cancelled = false;
    void queued.catch(() => {
      if (cancelled) return;
      retryTimer = window.setTimeout(
        () => setAssetPublishTick((tick) => tick + 1),
        1500,
      );
    });
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [cloudProjectId, liveEnabled, canEdit, audioFiles, bgFiles, assetPublishTick]);

  useEffect(() => {
    if (!cloudProjectId || !liveEnabled) return;
    const ATTEMPT_CAP = 20;
    const wanted = new Set<string>();
    const referenced = new Set<string>();
    for (const d of difficulties) {
      if (d.audioFilename) {
        referenced.add(d.audioFilename);
        if (!audioFiles[d.audioFilename]) wanted.add(d.audioFilename);
      }
      if (d.backgroundFilename) {
        referenced.add(d.backgroundFilename);
        if (!bgFiles[d.backgroundFilename]) wanted.add(d.backgroundFilename);
      }
    }
    for (const name of forcedAssetReloadsRef.current)
      if (referenced.has(name)) wanted.add(name);
    const attempts = assetAttemptsRef.current;
    for (const name of [...attempts.keys()])
      if (!wanted.has(name)) attempts.delete(name);

    const todo = [...wanted].filter((n) => (attempts.get(n) ?? 0) < ATTEMPT_CAP);
    if (!todo.length) return;

    let cancelled = false;
    let retry: number | undefined;
    void (async () => {
      for (const n of todo) attempts.set(n, (attempts.get(n) ?? 0) + 1);
      let fetched: Awaited<ReturnType<typeof loadProjectAssets>> = [];
      try {
        fetched = await loadProjectAssets(cloudProjectId, todo);
      } catch {
        fetched = [];
      }
      if (cancelled) return;
      if (fetched.length) {
        const newAudio: Record<string, LoadedFile> = {};
        const newBg: Record<string, LoadedFile> = {};
        for (const a of fetched) {
          const lf: LoadedFile = {
            name: a.name,
            url: URL.createObjectURL(a.blob),
            blob: a.blob,
          };
          if (a.kind === "audio") newAudio[a.name] = lf;
          else if (a.kind === "bg") newBg[a.name] = lf;
          else {
            URL.revokeObjectURL(lf.url);
            continue;
          }
          publishedAssetBlobsRef.current.set(`${a.kind}:${a.name}`, a.blob);
          forcedAssetReloadsRef.current.delete(a.name);
          attempts.delete(a.name);
        }
        if (Object.keys(newAudio).length) {
          setAudioFiles((prev) => {
            for (const [name, file] of Object.entries(newAudio)) {
              const old = prev[name];
              if (old && old.blob !== file.blob) URL.revokeObjectURL(old.url);
            }
            return { ...prev, ...newAudio };
          });
        }
        if (Object.keys(newBg).length) {
          setBgFiles((prev) => {
            for (const [name, file] of Object.entries(newBg)) {
              const old = prev[name];
              if (old && old.blob !== file.blob) URL.revokeObjectURL(old.url);
            }
            return { ...prev, ...newBg };
          });
        }
      }
      const anyRetryable = todo.some(
        (n) =>
          !fetched.some((f) => f.name === n) &&
          (attempts.get(n) ?? 0) < ATTEMPT_CAP,
      );
      if (anyRetryable && !cancelled)
        retry = window.setTimeout(() => setAssetSyncTick((t) => t + 1), 1200);
    })();
    return () => {
      cancelled = true;
      if (retry) window.clearTimeout(retry);
    };
  }, [cloudProjectId, liveEnabled, difficulties, audioFiles, bgFiles, assetSyncTick, setAudioFiles, setBgFiles]);

  useEffect(() => {
    if (!sessionActiveRef.current || !pendingDocSyncRef.current) return;
    if (cloudSyncTimerRef.current !== null) {
      window.clearTimeout(cloudSyncTimerRef.current);
    }
    cloudSyncTimerRef.current = window.setTimeout(() => {
      cloudSyncTimerRef.current = null;
      if (!pendingDocSyncRef.current) return;
      const pid = cloudProjectIdRef.current;
      if (!pid || !canEditRef.current) return;
      const recoveryProject = localProjectIdRef.current;
      const recoveryToken = recoverySaveToken();
      void cloudSync
        .save(async (data, expectedRevision, mutationId) => {
          // Audio and backgrounds publish first, so a saved chart never
          // names a file the cloud doesn't have yet.
          await assetPublishPromiseRef.current.catch(() => {});
          return saveProjectDataCloud(pid, data, mutationId, expectedRevision);
        })
        // doc.bump keeps old deployments functional; revision-aware peers ignore
        // the duplicate refresh produced by Postgres Changes.
        .then((stamp) => {
          if (cloudProjectIdRef.current !== pid) return;
          // Only edits the cloud now holds count as saved; anything newer
          // keeps the map unsaved and schedules the next save.
          if (cloudSync.isSaved(localEditVersionRef.current)) pendingDocSyncRef.current = false;
          else setCloudSyncRetry((value) => value + 1);
          if (!stamp) return;
          markRecoverySaved(recoveryProject, recoveryToken);
          const shown = liveSaveErrorRef.current;
          liveSaveErrorRef.current = null;
          setCloudError((current) => (current !== null && current === shown ? null : current));
          collabRef.current?.sendRefresh();
        })
        .catch((error) => {
          if (cloudProjectIdRef.current !== pid || !canEditRef.current) return;
          const detail = error instanceof Error ? error.message : t("app.unknownError");
          liveSaveErrorRef.current = t("app.liveSaveFailed", { detail });
          setCloudError(liveSaveErrorRef.current);
          if (cloudSyncTimerRef.current !== null) {
            window.clearTimeout(cloudSyncTimerRef.current);
          }
          cloudSyncTimerRef.current = window.setTimeout(() => {
            cloudSyncTimerRef.current = null;
            setCloudSyncRetry((value) => value + 1);
          }, 2_000);
        });
    }, 250);
    return () => {
      if (cloudSyncTimerRef.current !== null) {
        window.clearTimeout(cloudSyncTimerRef.current);
        cloudSyncTimerRef.current = null;
      }
    };
  }, [
    activeIdRef,
    difficultiesRef,
    localProjectIdRef,
    metaRef,
    setCloudError,
    timingPointsRef,
    t,
    meta,
    timingPoints,
    difficulties,
    activeId,
    view,
    bgScope,
    cloudSyncRetry,
    cloudSync,
    markRecoverySaved,
    recoverySaveToken,
  ]);

  return {
    announceAssetChange,
    applyingRemoteRef,
    assetAttemptsRef,
    canEdit,
    canEditRef,
    cloudProjectIdRef,
    cloudSync,
    collab,
    collabRef,
    commitDiffFields,
    commitNoteOp,
    liveEnabled,
    localEditVersionRef,
    markStructural,
    opRedoRef,
    opUndoRef,
    pendingDocSyncRef,
    pendingSeekRef,
    publishedAssetBlobsRef,
    sessionActiveRef,
    updateMeta,
  };
}

