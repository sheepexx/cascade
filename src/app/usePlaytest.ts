import type { AudioController } from "../hooks/useAudio";
import { DEFAULT_HUMANIZE } from "../types";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { SettingsTab } from "../components/menus/AppSettingsModal";
import { usePlaytestAutoplay } from "../hooks/usePlaytestAutoplay";
import { usePlaytestInput } from "../hooks/usePlaytestInput";
import { logAnalyticsEvent } from "../lib/analytics";
import type { AudioSeekTransition } from "../lib/audioSeek";
import type { AuthUser } from "../lib/auth";
import { findUnplayableNotes } from "../lib/autoplay";
import type { EditorKeybinds } from "../lib/editorKeybinds";
import {
  editorKeyLabel,
  matchesBind,
  normalizeEditorKeybinds,
} from "../lib/editorKeybinds";
import type { FeatureFlags } from "../lib/featureFlags";
import type { Translate } from "../lib/i18n";
import type { OsdNotice } from "../lib/osd";
import { osdRange } from "../lib/osd";
import type { SavedSkinBlob } from "../lib/persistence";
import type { PlaytestTiming } from "../lib/playtestClock";
import {
  MAX_PLAYTEST_SCROLL_SPEED,
  MIN_PLAYTEST_SCROLL_SPEED,
  gameplayTime,
  inputTime,
  runStartTime,
} from "../lib/playtestClock";
import type { PlaytestEngine } from "../lib/playtestEngine";
import { createPlaytestEngine } from "../lib/playtestEngine";
import type { PlaytestNoteIndex } from "../lib/playtestIndex";
import {
  buildPlaytestNoteIndex,
  firstNoteAtOrAfter,
  nearestPlayableNote,
} from "../lib/playtestIndex";
import {
  clampPlaytestRate,
  maniaJudgementWindows,
  maniaReleaseWindows,
} from "../lib/playtestJudgements";
import { createPlaytestScoreStore } from "../lib/playtestScoreStore";
import { PRESET_SKINS } from "../lib/presetSkins";
import type {
  AppSettings,
  Difficulty,
  LoadedFile,
  LoadedSkin,
  ManiaNote,
} from "../types";
import type { ModalId } from "./appTypes";

/** osu!mania's DelayedResumeOverlay counts 3 over two seconds. */
const PLAYTEST_RESUME_COUNTDOWN_MS = 2000;

/**
 * Where a playtest run is, not how it is going: the score lives in a store
 * the HUD reads (see playtestScoreStore), so judgements do not re-render the
 * editor.
 */
export type PlaytestRuntimeState = {
  active: boolean;
  hudEditing: boolean;
  /** Where the run's notes start: the playhead it was started from. */
  startTime: number;
  ended: boolean;
  paused: boolean;
  autoplay: boolean;
  runKey: number;
  countdownEndsAt: number | null;
  /** The countdown is bringing a paused run back rather than starting one. */
  resuming: boolean;
};

export function initialPlaytestState(): PlaytestRuntimeState {
  return {
    active: false,
    hudEditing: false,
    startTime: 0,
    ended: false,
    paused: false,
    autoplay: false,
    runKey: 0,
    countdownEndsAt: null,
    resuming: false,
  };
}

/**
 * The HUD editor plays the map only so the HUD has live numbers to sit against.
 * Scattered timing and the odd miss would make those numbers jump about while
 * something is being placed, so its run is always the perfect autoplay however
 * humanizing is set for a real playtest.
 */
const PERFECT_AUTOPLAY = { ...DEFAULT_HUMANIZE, enabled: false };

/**
 * Playtest: a run of the chart from the playhead with osu!mania's judging,
 * started with F5 like osu!'s editor test play. Owns the judge engine, the
 * count-in before the song starts, pause and the resume countdown, human and
 * autoplay input, the skin the run is drawn with and the per-frame miss and
 * end-of-song checks. The run's own state stays in App, since the editor
 * reads it to lock editing while a run is on.
 */
export function usePlaytest({
  active,
  activeNotesRef,
  announceShortcut,
  appSettings,
  audio,
  audioFile,
  authUserRef,
  editorKeybindsRef,
  featureFlagsRef,
  getCurrentTime,
  modalRef,
  openSettings,
  pauseAudio,
  playAudio,
  playtest,
  playtestHitsound,
  playtestRef,
  projectStarted,
  seekAudio,
  setAppSettings,
  setAudioPlaybackRate,
  setCommentsOpen,
  setModal,
  setPlaytest,
  skin,
  skinLibrary,
  t,
}: {
  active: Difficulty;
  activeNotesRef: MutableRefObject<ManiaNote[]>;
  announceShortcut: (notice: OsdNotice | string) => void;
  appSettings: AppSettings;
  audio: AudioController;
  audioFile: LoadedFile | null;
  authUserRef: MutableRefObject<AuthUser | null>;
  editorKeybindsRef: MutableRefObject<EditorKeybinds>;
  featureFlagsRef: MutableRefObject<FeatureFlags>;
  getCurrentTime: () => number;
  modalRef: MutableRefObject<ModalId>;
  openSettings: (tab?: SettingsTab) => void;
  pauseAudio: () => void;
  playAudio: () => void;
  playtest: PlaytestRuntimeState;
  playtestHitsound: (note: ManiaNote) => void;
  playtestRef: MutableRefObject<PlaytestRuntimeState>;
  projectStarted: boolean;
  seekAudio: (time: number, transition?: AudioSeekTransition) => void;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  setAudioPlaybackRate: (rate: number, rampSeconds?: number) => void;
  setCommentsOpen: Dispatch<SetStateAction<boolean>>;
  setModal: Dispatch<SetStateAction<ModalId>>;
  setPlaytest: Dispatch<SetStateAction<PlaytestRuntimeState>>;
  skin: LoadedSkin | null;
  skinLibrary: SavedSkinBlob[];
  t: Translate;
}) {
  const autoplayBeforeHudRef = useRef(false);
  const playtestEngineRef = useRef<PlaytestEngine | null>(null);
  /** The notes the engine was built from, to notice edits during a run. */
  const playtestEngineNotesRef = useRef<ManiaNote[] | null>(null);
  const [playtestScore] = useState(createPlaytestScoreStore);
  const playtestNoteIndexRef = useRef<PlaytestNoteIndex | null>(null);
  const playtestEndArmedRef = useRef(false);
  /** A run counting in over silence before the song's start. */
  const playtestPreRollRef = useRef<{
    from: number;
    startedAt: number;
    pausedAt: number | null;
    timer: number;
  } | null>(null);
  // The playfield reads the engine's note states through these.
  const playtestHiddenView = useMemo(
    () => ({ current: { has: (id: string) => playtestEngineRef.current?.hidden.has(id) ?? false } }),
    [],
  );
  const playtestHoldingView = useMemo(
    () => ({ current: { has: (id: string) => playtestEngineRef.current?.holding.has(id) ?? false } }),
    [],
  );
  const playtestDroppedView = useMemo(
    () => ({ current: { has: (id: string) => playtestEngineRef.current?.dropped.has(id) ?? false } }),
    [],
  );

  const playtestSettings = appSettings.playtest;
  const playtestSettingsRef = useRef(playtestSettings);
  playtestSettingsRef.current = playtestSettings;

  // Playtest can draw with a different skin than the editor. It is imported
  // as soon as it is picked, so starting a run never waits on it; until it is
  // ready, or if it has gone missing, the editor's skin stands in.
  const [playtestSkin, setPlaytestSkin] = useState<LoadedSkin | null>(null);
  const playtestSkinChoice = playtestSettings.skin;
  const playtestSkinSource = playtestSkinChoice?.source ?? null;
  const playtestSkinFile =
    playtestSkinChoice && playtestSkinChoice.source !== "none"
      ? playtestSkinChoice.fileName
      : null;
  const skinLibraryRef = useRef(skinLibrary);
  skinLibraryRef.current = skinLibrary;
  const playtestSavedSkin =
    playtestSkinSource === "saved"
      ? skinLibrary.find((saved) => saved.name === playtestSkinFile)
      : undefined;
  // Reloading the library hands back fresh blobs; only a re-import of this
  // skin should load it again.
  const playtestSavedStamp = playtestSavedSkin
    ? (playtestSavedSkin.savedAt ?? 0)
    : null;
  const playtestReusesEditorSkin =
    playtestSkinFile !== null && skin?.fileName === playtestSkinFile;
  useEffect(() => {
    const replace = (next: LoadedSkin | null) =>
      setPlaytestSkin((prev) => {
        if (prev && prev !== next) prev.objectUrls.forEach(URL.revokeObjectURL);
        return next;
      });
    if (!playtestSkinFile || playtestReusesEditorSkin) {
      replace(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      let blob: Blob | null = null;
      if (playtestSkinSource === "preset") {
        const preset = PRESET_SKINS.find((p) => p.fileName === playtestSkinFile);
        if (preset) {
          blob = await fetch(preset.url)
            .then((res) => (res.ok ? res.blob() : null))
            .catch(() => null);
        }
      } else {
        blob =
          skinLibraryRef.current.find((saved) => saved.name === playtestSkinFile)
            ?.blob ?? null;
      }
      const { importOsk } = await import("../lib/skinImport");
      const loaded = blob
        ? await importOsk(blob, playtestSkinFile).catch(() => null)
        : null;
      if (cancelled) {
        loaded?.objectUrls.forEach(URL.revokeObjectURL);
        return;
      }
      replace(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    playtestSkinFile,
    playtestSkinSource,
    playtestSavedStamp,
    playtestReusesEditorSkin,
  ]);

  const playtestLook =
    playtest.active && playtestSkinChoice
      ? playtestSkinChoice.source === "none"
        ? null
        : (playtestSkin ?? skin)
      : skin;
  const activeSkin = playtestLook?.keymodes[active.keyCount] ?? null;
  const playtestRate = clampPlaytestRate(playtestSettings.rate);
  const playtestWindows = useMemo(
    () => maniaJudgementWindows(active.overallDifficulty, playtestRate),
    [active.overallDifficulty, playtestRate],
  );
  const playtestReleaseWindows = useMemo(
    () => maniaReleaseWindows(active.overallDifficulty, playtestRate),
    [active.overallDifficulty, playtestRate],
  );
  const playtestWindowsRef = useRef(playtestWindows);
  playtestWindowsRef.current = playtestWindows;
  const playtestTiming = useMemo<PlaytestTiming>(
    () => ({
      rate: playtestRate,
      audioOffsetMs: playtestSettings.audioOffsetMs,
      inputOffsetMs: playtestSettings.inputOffsetMs,
    }),
    [playtestRate, playtestSettings.audioOffsetMs, playtestSettings.inputOffsetMs],
  );
  const playtestTimingRef = useRef(playtestTiming);
  playtestTimingRef.current = playtestTiming;

  const ensurePlaytestNoteIndex = useCallback(
    (notes: ManiaNote[], keyCount: number): PlaytestNoteIndex => {
      const existing = playtestNoteIndexRef.current;
      if (existing && existing.source === notes && existing.keyCount === keyCount) {
        return existing;
      }
      const next = buildPlaytestNoteIndex(notes, keyCount);
      playtestNoteIndexRef.current = next;
      return next;
    },
    [],
  );

  /** The music's time, or the count-in's while a run starts before zero. */
  const playtestAudioTime = useCallback(
    (now = performance.now()) => {
      const preRoll = playtestPreRollRef.current;
      if (preRoll) {
        const at = preRoll.pausedAt ?? now;
        const time =
          preRoll.from + (at - preRoll.startedAt) * playtestTimingRef.current.rate;
        if (time < 0) return time;
      }
      return getCurrentTime();
    },
    [getCurrentTime],
  );

  /** The time the playfield shows, which is also where misses are judged. */
  const playtestGameplayTime = useCallback(
    () => gameplayTime(playtestAudioTime(), playtestTimingRef.current),
    [playtestAudioTime],
  );

  /** The time a key press or release with this event stamp lands on. */
  const playtestInputTime = useCallback(
    (stamp?: number) => {
      const now = performance.now();
      return inputTime(playtestAudioTime(now), now, stamp, playtestTimingRef.current);
    },
    [playtestAudioTime],
  );

  const clearPlaytestPreRoll = useCallback(() => {
    const preRoll = playtestPreRollRef.current;
    if (preRoll?.timer) window.clearTimeout(preRoll.timer);
    playtestPreRollRef.current = null;
  }, []);

  /** Starts the song once the count-in before zero has run out. */
  const armPlaytestPreRoll = useCallback(() => {
    const preRoll = playtestPreRollRef.current;
    if (!preRoll) return;
    if (preRoll.timer) window.clearTimeout(preRoll.timer);
    const remaining =
      -preRoll.from / playtestTimingRef.current.rate -
      (performance.now() - preRoll.startedAt);
    preRoll.timer = window.setTimeout(() => {
      preRoll.timer = 0;
      playAudio();
    }, Math.max(0, remaining));
  }, [playAudio]);

  // Built on the first key press of a run rather than on every edit: only
  // playtest looks notes up by id.
  const noteByIdRef = useRef<{ notes: ManiaNote[]; byId: Map<string, ManiaNote> } | null>(null);
  const playtestNoteById = useCallback(
    (id: string) => {
      const notes = activeNotesRef.current;
      let cache = noteByIdRef.current;
      if (!cache || cache.notes !== notes) {
        cache = { notes, byId: new Map(notes.map((note) => [note.id, note])) };
        noteByIdRef.current = cache;
      }
      return cache.byId.get(id);
    },
    [activeNotesRef],
  );

  const resetPlaytestRuntime = useCallback(
    (startTime: number) => {
      playtestEngineRef.current = createPlaytestEngine({
        notes: active.notes,
        keyCount: active.keyCount,
        windows: playtestWindowsRef.current,
        startTime,
      });
      playtestEngineNotesRef.current = active.notes;
      playtestScore.reset(startTime);
      playtestEndArmedRef.current = false;
    },
    [active.keyCount, active.notes, playtestScore],
  );

  const handlePlaytestPress = useCallback(
    (column: number, atMs?: number, targetId?: string, stamp?: number) => {
      const pt = playtestRef.current;
      const engine = playtestEngineRef.current;
      if (!engine || !pt.active || pt.ended || pt.paused || pt.countdownEndsAt !== null) {
        return;
      }
      const time = atMs ?? playtestInputTime(stamp);
      const events = engine.press(column, time, targetId);
      playtestScore.apply(events);
      // osu!mania sounds every key press: the note it hit, or else the
      // nearest note in that column.
      const hit = events[0]?.kind === "judgement" ? events[0].result.noteId : null;
      const note = hit
        ? playtestNoteById(hit)
        : nearestPlayableNote(
            ensurePlaytestNoteIndex(active.notes, active.keyCount).byColumn[column] ?? [],
            time,
            Infinity,
            () => false,
          );
      if (note) playtestHitsound(note);
    },
    [
      playtestRef,
      active.keyCount,
      active.notes,
      ensurePlaytestNoteIndex,
      playtestHitsound,
      playtestInputTime,
      playtestNoteById,
      playtestScore,
    ],
  );

  const handlePlaytestRelease = useCallback(
    (column: number, atMs?: number, targetId?: string, stamp?: number) => {
      const pt = playtestRef.current;
      const engine = playtestEngineRef.current;
      if (!engine || !pt.active || pt.ended || pt.paused || pt.countdownEndsAt !== null) {
        return;
      }
      playtestScore.apply(
        engine.release(column, atMs ?? playtestInputTime(stamp), targetId),
      );
    },
    [playtestInputTime, playtestScore, playtestRef],
  );

  const exitPlaytest = useCallback(() => {
    const wasEditing = playtestRef.current.hudEditing;
    clearPlaytestPreRoll();
    pauseAudio();
    setPlaytest((prev) => ({
      ...prev,
      active: false,
      hudEditing: false,
      autoplay: wasEditing ? autoplayBeforeHudRef.current : prev.autoplay,
      ended: false,
      paused: false,
      countdownEndsAt: null,
      resuming: false,
    }));
    playtestEngineRef.current = null;
    playtestEngineNotesRef.current = null;
    if (wasEditing) openSettings("Playtest");
  }, [clearPlaytestPreRoll, openSettings, pauseAudio, playtestRef, setPlaytest]);

  // Starts a run at `startTime` like osu!'s editor test play: notes before it
  // are left out, and play goes on from there. The music starts right away,
  // backed up when needed so the first note has the lead-in, and before the
  // song's start the run counts in over silence.
  const startPlaytest = useCallback(
    (startTime = getCurrentTime(), { hudEditing = false }: { hudEditing?: boolean } = {}) => {
      if (!audioFile || !projectStarted) return;
      if (hudEditing && !playtestRef.current.hudEditing) {
        autoplayBeforeHudRef.current = playtestRef.current.autoplay;
      }
      const clamped = Math.max(0, Math.min(startTime, audio.duration || startTime));
      setModal(null);
      setCommentsOpen(false);
      void logAnalyticsEvent("playtest_started", authUserRef.current?.id).catch(
        () => {},
      );
      clearPlaytestPreRoll();
      pauseAudio();
      const rate = clampPlaytestRate(playtestSettingsRef.current.rate);
      setAudioPlaybackRate(rate, 0);
      const index = ensurePlaytestNoteIndex(active.notes, active.keyCount);
      const first = index.sorted[firstNoteAtOrAfter(index.sorted, clamped)];
      const from = runStartTime(clamped, first?.startTime ?? null, rate);
      resetPlaytestRuntime(clamped);
      setPlaytest((prev) => ({
        ...initialPlaytestState(),
        active: true,
        hudEditing,
        startTime: clamped,
        autoplay: hudEditing || prev.autoplay,
        runKey: prev.runKey + 1,
      }));
      if (from >= 0) {
        seekAudio(from);
        playAudio();
      } else {
        seekAudio(0);
        playtestPreRollRef.current = {
          from,
          startedAt: performance.now(),
          pausedAt: null,
          timer: 0,
        };
        armPlaytestPreRoll();
      }
    },
    [
      authUserRef,
      playtestRef,
      setCommentsOpen,
      setModal,
      setPlaytest,
      active.keyCount,
      active.notes,
      armPlaytestPreRoll,
      audio.duration,
      audioFile,
      clearPlaytestPreRoll,
      ensurePlaytestNoteIndex,
      getCurrentTime,
      pauseAudio,
      playAudio,
      projectStarted,
      resetPlaytestRuntime,
      seekAudio,
      setAudioPlaybackRate,
    ],
  );

  const restartPlaytest = useCallback(() => {
    const current = playtestRef.current;
    startPlaytest(current.startTime, { hudEditing: current.hudEditing });
  }, [startPlaytest, playtestRef]);

  useEffect(() => {
    if (playtest.active && playtest.hudEditing && playtest.ended) {
      startPlaytest(0, { hudEditing: true });
    }
  }, [playtest.active, playtest.hudEditing, playtest.ended, startPlaytest]);

  // Resuming counts down (osu!mania's DelayedResumeOverlay) and then plays on.
  useEffect(() => {
    const countdownEndsAt = playtest.countdownEndsAt;
    if (!playtest.active || playtest.ended || countdownEndsAt === null) return;
    const start = () => {
      const current = playtestRef.current;
      if (!current.active || current.countdownEndsAt !== countdownEndsAt) return;
      setPlaytest((prev) =>
        prev.active && prev.countdownEndsAt === countdownEndsAt
          ? { ...prev, countdownEndsAt: null, resuming: false }
          : prev,
      );
      // The rate may have been changed from the pause menu.
      setAudioPlaybackRate(playtestTimingRef.current.rate, 0);
      const preRoll = playtestPreRollRef.current;
      if (preRoll && preRoll.pausedAt !== null) {
        preRoll.startedAt += performance.now() - preRoll.pausedAt;
        preRoll.pausedAt = null;
        if (playtestAudioTime() < 0) {
          armPlaytestPreRoll();
          return;
        }
      }
      playAudio();
    };
    const remaining = countdownEndsAt - performance.now();
    if (remaining <= 0) {
      start();
      return;
    }
    const timer = window.setTimeout(start, remaining);
    return () => window.clearTimeout(timer);
  }, [
    playtestRef,
    setPlaytest,
    armPlaytestPreRoll,
    playAudio,
    playtest.active,
    playtest.countdownEndsAt,
    playtest.ended,
    playtestAudioTime,
    setAudioPlaybackRate,
  ]);

  const pausePlaytest = useCallback(() => {
    const preRoll = playtestPreRollRef.current;
    if (preRoll && preRoll.pausedAt === null) {
      if (preRoll.timer) window.clearTimeout(preRoll.timer);
      preRoll.timer = 0;
      preRoll.pausedAt = performance.now();
    }
    setPlaytest((prev) =>
      prev.active && !prev.ended && !prev.paused
        ? { ...prev, paused: true }
        : prev,
    );
    pauseAudio();
  }, [pauseAudio, setPlaytest]);

  const resumePlaytest = useCallback(() => {
    setPlaytest((prev) =>
      prev.active && !prev.ended && prev.paused
        ? {
            ...prev,
            paused: false,
            resuming: true,
            countdownEndsAt: performance.now() + PLAYTEST_RESUME_COUNTDOWN_MS,
          }
        : prev,
    );
  }, [setPlaytest]);

  const togglePlaytestPause = useCallback(() => {
    const pt = playtestRef.current;
    if (!pt.active || pt.ended) return;
    if (pt.paused) resumePlaytest();
    else pausePlaytest();
  }, [pausePlaytest, resumePlaytest, playtestRef]);

  const toggleAutoplay = useCallback(() => {
    setPlaytest((prev) =>
      prev.active && !prev.ended ? { ...prev, autoplay: !prev.autoplay } : prev,
    );
  }, [setPlaytest]);

  const handleHumanPress = useCallback(
    (column: number, stamp: number) => {
      if (playtestRef.current.autoplay) return;
      handlePlaytestPress(column, undefined, undefined, stamp);
    },
    [handlePlaytestPress, playtestRef],
  );

  const handleHumanRelease = useCallback(
    (column: number, stamp: number) => {
      if (playtestRef.current.autoplay) return;
      handlePlaytestRelease(column, undefined, undefined, stamp);
    },
    [handlePlaytestRelease, playtestRef],
  );

  // In-game scroll speed, on osu!'s keys.
  const adjustPlaytestScrollSpeed = useCallback(
    (direction: 1 | -1) => {
      setAppSettings((s) => {
        const scrollSpeed = Math.round(
          Math.min(
            MAX_PLAYTEST_SCROLL_SPEED,
            Math.max(MIN_PLAYTEST_SCROLL_SPEED, s.playtest.scrollSpeed + direction),
          ),
        );
        announceShortcut(
          osdRange(
            t("osd.scrollSpeed"),
            String(scrollSpeed),
            scrollSpeed,
            MIN_PLAYTEST_SCROLL_SPEED,
            MAX_PLAYTEST_SCROLL_SPEED,
            [
              editorKeyLabel(editorKeybindsRef.current.zoomOut),
              editorKeyLabel(editorKeybindsRef.current.zoomIn),
            ],
          ),
        );
        return { ...s, playtest: { ...s.playtest, scrollSpeed } };
      });
    },
    [announceShortcut, t, setAppSettings, editorKeybindsRef],
  );

  const playtestSpeedKeys = useMemo(
    () => normalizeEditorKeybinds(appSettings.editorKeybinds),
    [appSettings.editorKeybinds],
  );
  const { heldKeys: heldPlaytestKeys, pressedColumnsRef: playtestPressedColumnsRef } =
    usePlaytestInput({
      active: playtest.active && !playtest.hudEditing && playtest.countdownEndsAt === null,
      paused: playtest.paused,
      keyCount: active.keyCount,
      keybinds: playtestSettings.keybinds,
      quickRestartCode: playtestSettings.quickRestartKey,
      scrollSpeedDownCode: playtestSpeedKeys.zoomOut,
      scrollSpeedUpCode: playtestSpeedKeys.zoomIn,
      onPress: handleHumanPress,
      onRelease: handleHumanRelease,
      onPause: togglePlaytestPause,
      onRestart: restartPlaytest,
      onToggleAutoplay: toggleAutoplay,
      onScrollSpeed: adjustPlaytestScrollSpeed,
    });

  const playtestRunNotes = useMemo(() => {
    if (!playtest.active) return active.notes;
    // A run is a test from where it was started, so it leaves out what is
    // behind. The HUD editor is scrubbed rather than played, and keeps the
    // whole chart the way the editor always has it: seeking there moves the
    // playhead without throwing away everything before it, which otherwise
    // empties the density graph and moves the note count as it is dragged.
    const from = playtest.hudEditing
      ? active.notes
      : active.notes.filter((note) => note.startTime >= playtest.startTime);
    if (!playtest.hudEditing) return from;
    // The HUD editor's run is only a backdrop to place the HUD against, so the
    // notes autoplay cannot reach — a stack in one column, or a note starting
    // inside a hold — are left out rather than missed. Otherwise the combo and
    // accuracy being positioned jump about on their own.
    const unplayable = findUnplayableNotes(from);
    return unplayable.size > 0
      ? from.filter((note) => !unplayable.has(note.id))
      : from;
  }, [active.notes, playtest.active, playtest.startTime, playtest.hudEditing]);

  const { summary: autoplaySummary, profile: skillProfile } = usePlaytestAutoplay({
    enabled: playtest.autoplay,
    active: playtest.active && playtest.countdownEndsAt === null,
    paused: playtest.paused,
    ended: playtest.ended,
    notes: playtestRunNotes,
    keyCount: active.keyCount,
    humanize: playtest.hudEditing ? PERFECT_AUTOPLAY : playtestSettings.humanize,
    skill: playtestSettings.skill,
    windows: playtestWindows,
    releaseWindows: playtestReleaseWindows,
    rate: playtestRate,
    getCurrentTime: playtestInputTime,
    onPress: handlePlaytestPress,
    onRelease: handlePlaytestRelease,
    runKey: playtest.runKey,
  });

  const playtestTickRef = useRef({
    audio,
    active,
    playtestInputTime,
    playtestScore,
  });
  playtestTickRef.current = {
    audio,
    active,
    playtestInputTime,
    playtestScore,
  };

  // Once a frame while running: misses for whatever time has passed, and the
  // end of the song.
  useEffect(() => {
    if (
      !playtest.active ||
      playtest.ended ||
      playtest.paused ||
      playtest.countdownEndsAt !== null
    )
      return;
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const { audio, active, playtestInputTime, playtestScore } = playtestTickRef.current;
      const time = playtestInputTime();
      if (playtestEngineNotesRef.current !== active.notes) {
        // The map changed under the run (a collaborator's edit): judge the new
        // notes from here on.
        playtestEngineRef.current = createPlaytestEngine({
          notes: active.notes,
          keyCount: active.keyCount,
          windows: playtestWindowsRef.current,
          startTime: time,
        });
        playtestEngineNotesRef.current = active.notes;
      }
      const engine = playtestEngineRef.current;
      if (engine) playtestScore.apply(engine.update(time));
      if (playtestPreRollRef.current && time < 0) return;
      const now = audio.getCurrentTime();
      if (!playtestEndArmedRef.current) {
        const runStart = playtestRef.current.startTime ?? 0;
        if (now <= runStart + 1000) playtestEndArmedRef.current = true;
      }
      if (
        playtestEndArmedRef.current &&
        Number.isFinite(audio.duration) &&
        audio.duration > 0 &&
        now >= audio.duration - 10
      ) {
        audio.pause();
        setPlaytest((prev) => ({ ...prev, ended: true }));
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [
    playtestRef,
    setPlaytest,
    playtest.active,
    playtest.countdownEndsAt,
    playtest.ended,
    playtest.paused,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (playtestRef.current.hudEditing && e.code === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        exitPlaytest();
        return;
      }
      if (!matchesBind(e.code, editorKeybindsRef.current.playtestToggle))
        return;
      e.preventDefault();
      if (playtestRef.current.active) exitPlaytest();
      else if (!modalRef.current && featureFlagsRef.current.playtest)
        startPlaytest(getCurrentTime());
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [exitPlaytest, getCurrentTime, startPlaytest, featureFlagsRef, editorKeybindsRef, modalRef, playtestRef]);

  return {
    activeSkin,
    autoplaySummary,
    exitPlaytest,
    heldPlaytestKeys,
    playtestDroppedView,
    playtestGameplayTime,
    playtestHiddenView,
    playtestHoldingView,
    playtestLook,
    playtestPressedColumnsRef,
    playtestRate,
    playtestRunNotes,
    playtestScore,
    playtestSettings,
    playtestWindows,
    restartPlaytest,
    resumePlaytest,
    skillProfile,
    startPlaytest,
  };
}
