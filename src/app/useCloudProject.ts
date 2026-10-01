import { useCallback, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { logAnalyticsEvent } from "../lib/analytics";
import type { AuthUser } from "../lib/auth";
import type { DuplicateProjectMatch } from "../lib/cloud";
import {
  findDuplicateProjectsCloud,
  loadProjectCloud,
  saveProjectCloud,
} from "../lib/cloud";
import type { AccessRole } from "../lib/collab";
import { myAccess } from "../lib/collab";
import type { SampleFile } from "../lib/mapSamples";
import type { NoteOp } from "../lib/ops";
import { getSupabaseToken } from "../lib/supabase";
import { playUiSound } from "../lib/uiSounds";
import type {
  BackgroundScope,
  Difficulty,
  LoadedFile,
  SongMeta,
  TimingPoint,
  ViewState,
} from "../types";
import { DEFAULT_VIEW } from "../types";
import type { ModalId } from "./appTypes";
import { decodeJwtClaims } from "./appUtils";

/**
 * Saving the open map to the cloud and opening a cloud map. A first save
 * looks for a cloud map of the same song first, so it isn't uploaded twice.
 */
export function useCloudProject({
  activeId,
  assetAttemptsRef,
  audioFiles,
  authUser,
  authUserRef,
  bgFiles,
  bgScope,
  cloudProjectId,
  cloudRevisionRef,
  cloudSavePromiseRef,
  difficulties,
  localEditVersionRef,
  localProjectId,
  markRecoverySaved,
  meta,
  opRedoRef,
  opUndoRef,
  ownMutationIdsRef,
  pendingDocSyncRef,
  pendingSeekRef,
  publishedAssetBlobsRef,
  recoverySaveToken,
  refreshAuth,
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
}: {
  activeId: string;
  assetAttemptsRef: MutableRefObject<Map<string, number>>;
  audioFiles: Record<string, LoadedFile>;
  authUser: AuthUser | null;
  authUserRef: MutableRefObject<AuthUser | null>;
  bgFiles: Record<string, LoadedFile>;
  bgScope: BackgroundScope;
  cloudProjectId: string | null;
  cloudRevisionRef: MutableRefObject<number | null>;
  cloudSavePromiseRef: MutableRefObject<Promise<void>>;
  difficulties: Difficulty[];
  localEditVersionRef: MutableRefObject<number>;
  localProjectId: string;
  markRecoverySaved: (forProject: string, token: number) => void;
  meta: SongMeta;
  opRedoRef: MutableRefObject<NoteOp[]>;
  opUndoRef: MutableRefObject<NoteOp[]>;
  ownMutationIdsRef: MutableRefObject<Set<string>>;
  pendingDocSyncRef: MutableRefObject<boolean>;
  pendingSeekRef: MutableRefObject<number | null>;
  publishedAssetBlobsRef: MutableRefObject<Map<string, Blob>>;
  recoverySaveToken: () => number;
  refreshAuth: () => Promise<void>;
  replaceProject: (next: { meta: SongMeta; timingPoints: TimingPoint[]; difficulties: Difficulty[]; activeId?: string; audioFiles?: Record<string, LoadedFile>; backgroundFiles?: Record<string, LoadedFile>; videoFiles?: Record<string, LoadedFile>; sampleFiles?: Record<string, SampleFile>; localProjectId?: string; needsSongHint?: boolean; }) => void;
  sampleFiles: Record<string, SampleFile>;
  setBgScope: Dispatch<SetStateAction<BackgroundScope>>;
  setCloudError: Dispatch<SetStateAction<string | null>>;
  setCloudOwnerId: Dispatch<SetStateAction<string | null>>;
  setCloudProjectId: Dispatch<SetStateAction<string | null>>;
  setImportingMap: Dispatch<SetStateAction<boolean>>;
  setModal: Dispatch<SetStateAction<ModalId>>;
  setMyRole: Dispatch<SetStateAction<AccessRole>>;
  setView: Dispatch<SetStateAction<ViewState>>;
  timingPoints: TimingPoint[];
  view: ViewState;
}) {
  const [cloudSaveStatus, setCloudSaveStatus] = useState<
    null | "saving" | "saved" | "error"
  >(null);
  const [duplicateCloudMatches, setDuplicateCloudMatches] = useState<
    DuplicateProjectMatch[] | null
  >(null);

  const handleCloudSave = useCallback(async (
    target: { overwriteId?: string; asNewMap?: boolean } = {},
  ) => {
    const { overwriteId, asNewMap = false } = target;
    if (!authUser) return;
    setCloudSaveStatus("saving");
    setCloudError(null);

    try {
      await refreshAuth();
    } catch {
    }
    const token = getSupabaseToken();
    const claims = token ? decodeJwtClaims(token) : null;
    const expired = !!claims?.exp && Date.now() >= claims.exp * 1000;
    if (!token || !claims || expired) {
      setCloudError(
        `Your osu! session isn't active (token ${
          expired ? "expired" : "missing"
        }). Log out and back in, then save again.`,
      );
      setCloudSaveStatus("error");
      return;
    }

    const recoveryToken = recoverySaveToken();
    try {
      await cloudSavePromiseRef.current.catch(() => {});
      const targetId = cloudProjectId ?? overwriteId ?? null;
      const creatingProject = !targetId;
      const data = { meta, timingPoints, difficulties, activeId, view, bgScope };
      if (creatingProject && !asNewMap) {
        const matches = await findDuplicateProjectsCloud(data);
        if (matches.length > 0) {
          setDuplicateCloudMatches(matches);
          setCloudSaveStatus(null);
          return;
        }
      }
      const mutationId = crypto.randomUUID();
      if (!creatingProject) ownMutationIdsRef.current.add(mutationId);
      const id = await saveProjectCloud({
        ownerId: authUser.id,
        projectId: targetId,
        data,
        audioFiles: Object.values(audioFiles).map((f) => ({
          name: f.name,
          blob: f.blob,
        })),
        bgFiles: Object.values(bgFiles).map((f) => ({
          name: f.name,
          blob: f.blob,
        })),
        sampleFiles: Object.values(sampleFiles),
        mutationId,
      });
      publishedAssetBlobsRef.current = new Map([
        ...Object.values(audioFiles).map(
          (f) => [`audio:${f.name}`, f.blob] as const,
        ),
        ...Object.values(bgFiles).map(
          (f) => [`bg:${f.name}`, f.blob] as const,
        ),
      ]);
      setCloudProjectId(id);
      markRecoverySaved(localProjectId, recoveryToken);
      // A new map and an overwritten duplicate are both the caller's own.
      if (!cloudProjectId) {
        setCloudOwnerId(authUser.id);
        setMyRole("owner");
      }
      setCloudSaveStatus("saved");
      playUiSound("saveToCloudDone");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Couldn't save to your account.";
      if (/row-level security|violates|not authorized|permission/i.test(msg)) {
        if (claims.sub !== authUser.id) {
          setCloudError(
            "Save rejected: your session token identifies a different account " +
              "than your profile. Log out and back in.",
          );
        } else if (claims.role !== "authenticated") {
          setCloudError(
            `Save rejected: token role is "${claims.role}", expected ` +
              `"authenticated". The Worker is minting tokens incorrectly.`,
          );
        } else {
          setCloudError(
            "Save rejected by the database. Your token looks valid but Supabase " +
              "isn't accepting it - the Worker's SUPABASE_JWT_SECRET must match " +
              "this project's JWT secret (and the legacy JWT secret must stay enabled).",
          );
          console.error(
            "[cloud] RLS rejection with a valid-looking token.",
            "front-end project:",
            import.meta.env.VITE_SUPABASE_URL,
            "| token sub:",
            claims.sub,
            "| role:",
            claims.role,
          );
        }
      } else {
        setCloudError(msg);
      }
      setCloudSaveStatus("error");
    }
  }, [
    setCloudError,
    setCloudOwnerId,
    setCloudProjectId,
    setMyRole,
    cloudSavePromiseRef,
    ownMutationIdsRef,
    publishedAssetBlobsRef,
    authUser,
    refreshAuth,
    cloudProjectId,
    meta,
    timingPoints,
    difficulties,
    activeId,
    view,
    bgScope,
    audioFiles,
    bgFiles,
    sampleFiles,
    localProjectId,
    markRecoverySaved,
    recoverySaveToken,
  ]);

  const loadCloudProject = useCallback(async (id: string) => {
    setCloudError(null);
    setModal(null);
    setImportingMap(true);
    pendingDocSyncRef.current = false;
    cloudRevisionRef.current = null;
    ownMutationIdsRef.current.clear();
    localEditVersionRef.current = 0;
    try {
      const proj = await loadProjectCloud(id);
      void logAnalyticsEvent("collab_joined", authUserRef.current?.id).catch(
        () => {},
      );
      publishedAssetBlobsRef.current = new Map([
        ...proj.audio.map((a) => [`audio:${a.name}`, a.blob] as const),
        ...proj.bg.map((b) => [`bg:${b.name}`, b.blob] as const),
      ]);
      assetAttemptsRef.current.clear();
      const loaded = (files: { name: string; blob: Blob }[]) =>
        Object.fromEntries(
          files.map((f) => [f.name, { name: f.name, url: URL.createObjectURL(f.blob), blob: f.blob }]),
        );
      // Where this map was left the last time it was open here.
      let remembered: { activeId?: string; playheadMs?: number } = {};
      try {
        const raw = localStorage.getItem(`mania:pos:${proj.id}`);
        if (raw) remembered = JSON.parse(raw) as typeof remembered;
      } catch {
      }
      const d = proj.data;
      const known = (id?: string) => !!id && (d.difficulties ?? []).some((x) => x.id === id);
      replaceProject({
        meta: d.meta,
        timingPoints: d.timingPoints,
        difficulties: d.difficulties ?? [],
        activeId: known(remembered.activeId) ? remembered.activeId : d.activeId,
        audioFiles: loaded(proj.audio),
        backgroundFiles: loaded(proj.bg),
        sampleFiles: Object.fromEntries(proj.samples.map((sample) => [sample.name, sample])),
        localProjectId: `cloud-${proj.id}`,
      });
      if (d.view) setView({ ...DEFAULT_VIEW, ...d.view });
      setBgScope(d.bgScope ?? "mapset");
      // After replaceProject, which clears the cloud link for a plain import.
      setCloudProjectId(proj.id);
      setCloudOwnerId(proj.owner);
      opUndoRef.current = [];
      opRedoRef.current = [];
      const me = authUserRef.current;
      if (me) {
        if (proj.owner === me.id) setMyRole("owner");
        else
          myAccess(proj.id, me.id)
            .then(setMyRole)
            .catch(() => setMyRole(null));
      }
      if (typeof remembered.playheadMs === "number") {
        pendingSeekRef.current = remembered.playheadMs;
      }
    } catch (err) {
      setCloudError(
        err instanceof Error ? err.message : "Couldn't load that map.",
      );
    } finally {
      setImportingMap(false);
    }
  }, [assetAttemptsRef, cloudRevisionRef, localEditVersionRef, opRedoRef, opUndoRef, ownMutationIdsRef, pendingDocSyncRef, pendingSeekRef, publishedAssetBlobsRef, replaceProject, authUserRef, setBgScope, setCloudError, setCloudOwnerId, setCloudProjectId, setImportingMap, setModal, setMyRole, setView]);

  return {
    cloudSaveStatus,
    duplicateCloudMatches,
    handleCloudSave,
    loadCloudProject,
    setCloudSaveStatus,
    setDuplicateCloudMatches,
  };
}
