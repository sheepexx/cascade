import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { logAnalyticsEvent } from "../lib/analytics";
import type { AuthUser } from "../lib/auth";
import type { ClipAsset, ClipAssetKind } from "../lib/clipboardAssets";
import { loadClipAssets, placeClipAssets, saveClipAssets } from "../lib/clipboardAssets";
import { pushClip } from "../lib/clipboardStore";
import type { DifficultyClip } from "../lib/clipboardStore";
import { adoptCopiedDifficulty } from "../lib/editorClipboard";
import type { Translate } from "../lib/i18n";
import type { RateCreateOptions } from "../lib/rateChange";
import { createRateDifficulty as makeRateDifficulty } from "../lib/rateChange";
import type { BackupReason } from "../lib/recovery";
import type { Difficulty, LoadedFile, SongMeta, TimingPoint } from "../types";
import { DEFAULT_SONG_META, makeDifficulty, uid } from "../types";

/**
 * Adding, duplicating, rate-changing and deleting difficulties, and copying
 * one (with its music, background and video) to paste into another project.
 * Deleting backs the chart up first and drops media no difficulty uses.
 */
export function useDifficultyActions({
  activeId,
  activeIdRef,
  announceAssetChange,
  audioFilesRef,
  authUserRef,
  backupRecovery,
  bgFilesRef,
  canEditRef,
  difficulties,
  difficultiesRef,
  markStructural,
  metaRef,
  setActiveId,
  setAudioFiles,
  setBgFiles,
  setDifficulties,
  setImportNotice,
  setMeta,
  setVideoFiles,
  t,
  timingPoints,
  videoFilesRef,
}: {
  activeId: string;
  activeIdRef: MutableRefObject<string>;
  announceAssetChange: (action: string) => void;
  audioFilesRef: MutableRefObject<Record<string, LoadedFile>>;
  authUserRef: MutableRefObject<AuthUser | null>;
  backupRecovery: (reason: BackupReason) => Promise<boolean>;
  bgFilesRef: MutableRefObject<Record<string, LoadedFile>>;
  canEditRef: MutableRefObject<boolean>;
  difficulties: Difficulty[];
  difficultiesRef: MutableRefObject<Difficulty[]>;
  markStructural: () => void;
  metaRef: MutableRefObject<SongMeta>;
  setActiveId: Dispatch<SetStateAction<string>>;
  setAudioFiles: Dispatch<SetStateAction<Record<string, LoadedFile>>>;
  setBgFiles: Dispatch<SetStateAction<Record<string, LoadedFile>>>;
  setDifficulties: Dispatch<SetStateAction<Difficulty[]>>;
  setImportNotice: Dispatch<SetStateAction<string | null>>;
  setMeta: Dispatch<SetStateAction<SongMeta>>;
  setVideoFiles: Dispatch<SetStateAction<Record<string, LoadedFile>>>;
  t: Translate;
  timingPoints: TimingPoint[];
  videoFilesRef: MutableRefObject<Record<string, LoadedFile>>;
}) {
  const addDifficulty = useCallback(() => {
    if (!canEditRef.current) return;
    const base = difficulties.find((d) => d.id === activeId);
    const diff = makeDifficulty("New Difficulty", base?.keyCount ?? 4);
    diff.audioFilename = base?.audioFilename;
    diff.timingPoints = (base?.timingPoints?.length
      ? base.timingPoints
      : timingPoints
    ).map((p) => ({ ...p, id: uid("tp") }));
    markStructural();
    setDifficulties((prev) => [...prev, diff]);
    setActiveId(diff.id);
  }, [difficulties, activeId, timingPoints, markStructural, canEditRef, setActiveId, setDifficulties]);

  /**
   * Builds a rate-shifted copy of the active difficulty. The source is left
   * untouched; the copy carries its own audioRate so the editor plays the
   * shared audio file at that rate. Picked up by the snapshot history like any
   * other structural change, so it undoes/redoes for free.
   */
  const createRateDifficulty = useCallback(
    (options: RateCreateOptions) => {
      if (!canEditRef.current) return;
      const source = difficultiesRef.current.find(
        (d) => d.id === activeIdRef.current,
      );
      if (!source) return;
      const rated = makeRateDifficulty(source, {
        ...options,
        existingNames: difficultiesRef.current.map((d) => d.name),
      });
      markStructural();
      setDifficulties((prev) => [...prev, rated]);
      setActiveId(rated.id);
      void logAnalyticsEvent("rate_change_export", authUserRef.current?.id).catch(
        () => {},
      );
    },
    [markStructural, canEditRef, activeIdRef, authUserRef, difficultiesRef, setActiveId, setDifficulties],
  );

  const duplicateDifficulty = useCallback(
    (id: string) => {
      if (!canEditRef.current) return;
      markStructural();
      setDifficulties((prev) => {
        const src = prev.find((d) => d.id === id);
        if (!src) return prev;
        const copy: Difficulty = {
          ...src,
          id: uid("diff"),
          name: t("app.copyName", { name: src.name }),
          // Unsubmitted copy: reusing the source's id would collide with it.
          beatmapId: undefined,
          timingPoints: src.timingPoints.map((p) => ({ ...p, id: uid("tp") })),
          notes: src.notes.map((n) => ({ ...n, id: uid("n") })),
        };
        return [...prev, copy];
      });
    },
    [markStructural, t, canEditRef, setDifficulties],
  );

  // Copying needs no edit access: a map someone shared read-only is still a
  // fine source to paste into one of your own. The music, background and video
  // it plays go along, so it pastes whole into any project.
  const copyDifficulty = useCallback(async (id: string) => {
    const difficulty = difficultiesRef.current.find((d) => d.id === id);
    if (!difficulty) return;
    const audioNames = Object.keys(audioFilesRef.current);
    const audio =
      (difficulty.audioFilename && audioFilesRef.current[difficulty.audioFilename]) ||
      (audioNames.length === 1 ? audioFilesRef.current[audioNames[0]] : null);
    const background = difficulty.backgroundFilename
      ? bgFilesRef.current[difficulty.backgroundFilename]
      : null;
    const video = difficulty.videoFilename
      ? videoFilesRef.current[difficulty.videoFilename]
      : null;
    const files: ClipAsset[] = [];
    if (audio) files.push({ kind: "audio", name: audio.name, blob: audio.blob });
    if (background) {
      files.push({ kind: "background", name: background.name, blob: background.blob });
    }
    if (video) files.push({ kind: "video", name: video.name, blob: video.blob });

    const clipId = uid("clip");
    const saved =
      files.length > 0 &&
      (await saveClipAssets(clipId, files).then(
        () => true,
        () => false,
      ));
    const label = difficulty.name || "the difficulty";
    pushClip({
      kind: "difficulty",
      id: clipId,
      // Named after the song it plays, so a map that only had one song and
      // never named it still pastes with the right one.
      difficulty: { ...difficulty, audioFilename: audio?.name ?? difficulty.audioFilename },
      source: `${metaRef.current.artist} - ${metaRef.current.title}`,
      meta: metaRef.current,
      assets: saved
        ? files.map(({ kind, name, blob }) => ({ kind, name, bytes: blob.size }))
        : [],
    });
    setImportNotice(
      files.length && !saved
        ? `Copied ${label}, but its music and background didn't fit in browser storage`
        : `Copied ${label} to the clipboard`,
    );
  }, [audioFilesRef, bgFilesRef, difficultiesRef, metaRef, setImportNotice, videoFilesRef]);

  const pasteDifficulty = useCallback(
    async (clip: DifficultyClip) => {
      if (!canEditRef.current) return;
      const expected = clip.assets?.length ?? 0;
      const stored = expected
        ? await loadClipAssets(clip.id).catch((): ClipAsset[] => [])
        : [];
      const { names, added } = await placeClipAssets(stored, {
        audio: audioFilesRef.current,
        background: bgFilesRef.current,
        video: videoFilesRef.current,
      });
      if (!canEditRef.current) return;

      const addedOf = (kind: ClipAssetKind) =>
        added.filter((file) => file.kind === kind);
      const loaded = (kind: ClipAssetKind): LoadedFile[] =>
        addedOf(kind).map((file) => ({
          name: file.name,
          blob: file.blob,
          url: URL.createObjectURL(file.blob),
        }));
      const register =
        (files: LoadedFile[]) => (prev: Record<string, LoadedFile>) =>
          files.length
            ? { ...prev, ...Object.fromEntries(files.map((f) => [f.name, f])) }
            : prev;
      const newAudio = loaded("audio");
      const newBackgrounds = loaded("background");
      const newVideos = loaded("video");

      const current = difficultiesRef.current;
      const base =
        current.find((d) => d.id === activeIdRef.current) ?? current[0];
      const source = clip.difficulty;
      const diff = adoptCopiedDifficulty(
        {
          ...source,
          audioFilename: names.audio ?? source.audioFilename,
          backgroundFilename: names.background ?? source.backgroundFilename,
          videoFilename: names.video ?? source.videoFilename,
        },
        {
          existingNames: current.map((d) => d.name),
          audioFilenames: [
            ...Object.keys(audioFilesRef.current),
            ...newAudio.map((f) => f.name),
          ],
          backgroundFilenames: [
            ...Object.keys(bgFilesRef.current),
            ...newBackgrounds.map((f) => f.name),
          ],
          videoFilenames: [
            ...Object.keys(videoFilesRef.current),
            ...newVideos.map((f) => f.name),
          ],
          base,
        },
      );

      // Difficulties that play this map's only song without naming it would
      // lose it once a second song arrives, so name it for them first.
      const ownSongs = Object.keys(audioFilesRef.current);
      const lone = newAudio.length && ownSongs.length === 1 ? ownSongs[0] : null;
      const pinned = (list: Difficulty[]) =>
        lone
          ? list.map((d) =>
              d.audioFilename && audioFilesRef.current[d.audioFilename]
                ? d
                : { ...d, audioFilename: lone },
            )
          : list;

      markStructural();
      setAudioFiles(register(newAudio));
      setBgFiles(register(newBackgrounds));
      setVideoFiles(register(newVideos));
      setDifficulties((prev) => [...pinned(prev), diff]);
      setActiveId(diff.id);
      // A fresh project takes the song details along with the song.
      const own = metaRef.current;
      if (
        clip.meta &&
        own.title === DEFAULT_SONG_META.title &&
        own.artist === DEFAULT_SONG_META.artist
      ) {
        setMeta({ ...clip.meta, beatmapSetId: undefined });
      }
      announceAssetChange(`added the difficulty ${diff.name}`);
      setImportNotice(
        expected > stored.length
          ? `Added ${diff.name}, but its copied music and background are no longer in browser storage`
          : `Added ${diff.name} as a new difficulty`,
      );
    },
    [markStructural, announceAssetChange, canEditRef, activeIdRef, audioFilesRef, bgFilesRef, difficultiesRef, metaRef, setActiveId, setAudioFiles, setBgFiles, setDifficulties, setImportNotice, setMeta, setVideoFiles, videoFilesRef],
  );

  const pruneOrphanAssets = useCallback((remaining: Difficulty[]) => {
    const prune = (
      reg: Record<string, LoadedFile>,
      used: Set<string>,
    ): Record<string, LoadedFile> => {
      let changed = false;
      const next: Record<string, LoadedFile> = {};
      for (const [name, file] of Object.entries(reg)) {
        if (used.has(name)) next[name] = file;
        else {
          if (file.url) URL.revokeObjectURL(file.url);
          changed = true;
        }
      }
      return changed ? next : reg;
    };

    setAudioFiles((prev) => {
      const names = Object.keys(prev);
      const lone = names.length === 1 ? names[0] : null;
      const used = new Set<string>();
      for (const d of remaining) {
        const name =
          d.audioFilename && prev[d.audioFilename] ? d.audioFilename : lone;
        if (name) used.add(name);
      }
      return prune(prev, used);
    });

    setBgFiles((prev) =>
      prune(
        prev,
        new Set(
          remaining
            .map((d) => d.backgroundFilename)
            .filter((n): n is string => !!n),
        ),
      ),
    );

    setVideoFiles((prev) =>
      prune(
        prev,
        new Set(
          remaining.map((d) => d.videoFilename).filter((n): n is string => !!n),
        ),
      ),
    );
  }, [setAudioFiles, setBgFiles, setVideoFiles]);

  const deleteDifficulties = useCallback(
    (ids: string[]) => {
      if (!canEditRef.current || ids.length === 0) return;
      const prev = difficultiesRef.current;
      const remove = new Set(ids);
      let next = prev.filter((d) => !remove.has(d.id));
      if (next.length === 0) next = prev.slice(0, 1);
      if (next.length === prev.length) return;
      void backupRecovery("before-delete");
      markStructural();
      setDifficulties(next);
      if (!next.some((d) => d.id === activeIdRef.current))
        setActiveId(next[0].id);
      pruneOrphanAssets(next);
    },
    [backupRecovery, markStructural, pruneOrphanAssets, canEditRef, activeIdRef, difficultiesRef, setActiveId, setDifficulties],
  );

  return {
    addDifficulty,
    copyDifficulty,
    createRateDifficulty,
    deleteDifficulties,
    duplicateDifficulty,
    pasteDifficulty,
  };
}
