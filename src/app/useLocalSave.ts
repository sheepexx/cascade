import { useCallback, useEffect, useRef, useState } from "react";
import type { SampleFile } from "../lib/mapSamples";
import type { SavedProject } from "../lib/persistence";
import {
  PROJECT_VERSION,
  requestPersistentStorage,
  saveProject,
} from "../lib/persistence";
import type {
  AppSettings,
  BackgroundScope,
  Difficulty,
  LoadedFile,
  LoadedSkin,
  SongMeta,
  TimingPoint,
  ViewState,
} from "../types";
import { describeSaveError } from "./appUtils";

const LOCAL_AUTOSAVE_MS = 60000;

/**
 * Saving the open map to this device: Ctrl+S, the save badge, and the
 * autosave that runs once a minute while editing and again when the tab hides.
 */
export function useLocalSave({
  activeId,
  appSettings,
  audioFiles,
  bgFiles,
  bgScope,
  canEdit,
  difficulties,
  localProjectId,
  markRecoverySaved,
  meta,
  projectStarted,
  recoverySaveToken,
  sampleFiles,
  skin,
  timingPoints,
  videoFiles,
  view,
}: {
  activeId: string;
  appSettings: AppSettings;
  audioFiles: Record<string, LoadedFile>;
  bgFiles: Record<string, LoadedFile>;
  bgScope: BackgroundScope;
  canEdit: boolean;
  difficulties: Difficulty[];
  localProjectId: string;
  markRecoverySaved: (forProject: string, token: number) => void;
  meta: SongMeta;
  projectStarted: boolean;
  recoverySaveToken: () => number;
  sampleFiles: Record<string, SampleFile>;
  skin: LoadedSkin | null;
  timingPoints: TimingPoint[];
  videoFiles: Record<string, LoadedFile>;
  view: ViewState;
}) {
  const [saveStatus, setSaveStatus] = useState<
    null | "saving" | "saved" | "error"
  >(null);
  const [saveErrorDetail, setSaveErrorDetail] = useState<string | null>(null);

  const buildSavedProject = useCallback((): SavedProject => ({
    version: PROJECT_VERSION,
    savedAt: Date.now(),
    meta,
    timingPoints,
    difficulties,
    activeId,
    view,
    appSettings,
    bgScope,
    audioFiles: Object.values(audioFiles).map((f) => ({
      name: f.name,
      blob: f.blob,
    })),
    backgroundFiles: Object.values(bgFiles).map((f) => ({
      name: f.name,
      blob: f.blob,
    })),
    videoFiles: Object.values(videoFiles).map((f) => ({
      name: f.name,
      blob: f.blob,
    })),
    sampleFiles: Object.values(sampleFiles),
    background: null,
    skin: skin ? { name: skin.fileName, blob: skin.blob } : null,
  }), [
    meta,
    timingPoints,
    difficulties,
    activeId,
    view,
    appSettings,
    bgScope,
    audioFiles,
    bgFiles,
    videoFiles,
    sampleFiles,
    skin,
  ]);

  const handleSave = useCallback(async (silent = false) => {
    setSaveStatus("saving");
    if (!silent) requestPersistentStorage();
    const token = recoverySaveToken();
    try {
      await saveProject(buildSavedProject(), localProjectId);
      markRecoverySaved(localProjectId, token);
      setSaveErrorDetail(null);
      setSaveStatus("saved");
    } catch (err) {
      setSaveErrorDetail(describeSaveError(err));
      setSaveStatus("error");
    }
  }, [buildSavedProject, localProjectId, markRecoverySaved, recoverySaveToken]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = window.setTimeout(() => setSaveStatus(null), 1800);
    return () => window.clearTimeout(timer);
  }, [saveStatus]);

  const localAutosaveTimerRef = useRef<number | undefined>(undefined);
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const localAutosaveActive =
    projectStarted && appSettings.localAutosaveEnabled && canEdit;
  // Every edit gives handleSave a new identity. The first change arms the
  // timer and later ones leave it running, so steady editing still saves once
  // a minute instead of pushing the save back on every change until a crash.
  useEffect(() => {
    if (!localAutosaveActive || localAutosaveTimerRef.current !== undefined) return;
    localAutosaveTimerRef.current = window.setTimeout(() => {
      localAutosaveTimerRef.current = undefined;
      void handleSaveRef.current(true);
    }, LOCAL_AUTOSAVE_MS);
  }, [localAutosaveActive, handleSave]);

  useEffect(() => {
    if (!localAutosaveActive) return;
    const flush = () => {
      window.clearTimeout(localAutosaveTimerRef.current);
      localAutosaveTimerRef.current = undefined;
      void handleSaveRef.current(true);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", flushWhenHidden);

    return () => {
      // A pending save was armed for the project that was open. Switching
      // projects starts the wait over rather than saving halfway through a load.
      window.clearTimeout(localAutosaveTimerRef.current);
      localAutosaveTimerRef.current = undefined;
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", flushWhenHidden);
    };
  }, [localAutosaveActive, localProjectId]);

  return {
    handleSave,
    saveErrorDetail,
    saveStatus,
    setSaveStatus,
  };
}
