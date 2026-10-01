import { useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { dialogIsOpen } from "../hooks/useDialog";
import { MAX_PLAYFIELD_SCALE, MIN_PLAYFIELD_SCALE } from "../lib/altWheel";
import type { EditorAction, EditorKeybinds } from "../lib/editorKeybinds";
import {
  editorKeyLabel,
  matchesBind,
  snapDivisorForBind,
  timelineZoomDirection,
} from "../lib/editorKeybinds";
import type { Translate } from "../lib/i18n";
import type { OsdNotice } from "../lib/osd";
import { osdRange, osdToggle } from "../lib/osd";
import {
  closestDivisor,
  nextSnapPreset,
  presetDivisors,
  stepDivisor,
} from "../lib/snapPresets";
import type { AppSettings, ViewState } from "../types";
import { MAX_SCROLL_SPEED, MIN_SCROLL_SPEED } from "../types";
import type { ModalId } from "./appTypes";
import { blurActiveControl, isTypingTarget } from "./appUtils";
import type { PlaytestRuntimeState } from "./usePlaytest";

/**
 * The editor's window-level keyboard handling: the configurable editor keys,
 * Ctrl shortcuts (save, undo, redo, jump to time), a bare Alt that only drops
 * focus, and F12 kept from opening devtools.
 */
export function useEditorHotkeys({
  addBookmark,
  announceShortcut,
  appSettingsRef,
  askBgScope,
  audioVolumeRef,
  currentTimeRef,
  editorKeybindsRef,
  handleSave,
  hasAudioRef,
  modalRef,
  playtestRef,
  projectStartedRef,
  redo,
  seekBookmark,
  setAppSettings,
  setAudioPlaybackRate,
  setAudioVolume,
  setJumpToTimeOpen,
  setView,
  setVolumeHudKey,
  setZenMode,
  showChromeRef,
  t,
  toggleAudio,
  undo,
  viewRef,
}: {
  addBookmark: (ms: number, label?: string) => void;
  announceShortcut: (notice: OsdNotice | string) => void;
  appSettingsRef: MutableRefObject<AppSettings>;
  askBgScope: boolean;
  audioVolumeRef: MutableRefObject<number>;
  currentTimeRef: MutableRefObject<number>;
  editorKeybindsRef: MutableRefObject<EditorKeybinds>;
  handleSave: (silent?: boolean) => Promise<void>;
  hasAudioRef: MutableRefObject<boolean>;
  modalRef: MutableRefObject<ModalId>;
  playtestRef: MutableRefObject<PlaytestRuntimeState>;
  projectStartedRef: MutableRefObject<boolean>;
  redo: () => void;
  seekBookmark: (direction: "previous" | "next") => void;
  setAppSettings: Dispatch<SetStateAction<AppSettings>>;
  setAudioPlaybackRate: (rate: number, rampSeconds?: number) => void;
  setAudioVolume: (v: number) => void;
  setJumpToTimeOpen: Dispatch<SetStateAction<boolean>>;
  setView: Dispatch<SetStateAction<ViewState>>;
  setVolumeHudKey: Dispatch<SetStateAction<number>>;
  setZenMode: Dispatch<SetStateAction<boolean>>;
  showChromeRef: MutableRefObject<boolean>;
  t: Translate;
  toggleAudio: () => void;
  undo: () => void;
  viewRef: MutableRefObject<ViewState>;
}) {
  const slowHeldRef = useRef(false);
  useEffect(() => {
    const shouldIgnoreHotkey = (e: KeyboardEvent, allowInSkinModal = false) => {
      if (playtestRef.current.active) return true;
      if (!projectStartedRef.current) return true;
      // Play/pause is the one hotkey the skin dialog wants, so its preview can
      // be started and stopped without leaving the dialog. dialogIsOpen() is
      // true for the skin dialog itself, so it has to be exempted as well.
      const skinPreview = allowInSkinModal && modalRef.current === "skin";
      if (!skinPreview && (modalRef.current || askBgScope || dialogIsOpen())) {
        return true;
      }
      if (!isTypingTarget(e.target)) return false;
      return (e.target as HTMLInputElement).type !== "range";
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const binds = editorKeybindsRef.current;
      const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;
      const is = (action: EditorAction) => matchesBind(e.code, binds[action]);
      const isSpace = is("playPause");
      const isTab = is("zenMode");
      const isUp = is("volumeUp");
      const isDown = is("volumeDown");
      const symbolZoom = noMod ? timelineZoomDirection(e.key) : 0;
      const isTimelineZoomOut =
        is("scrollSpeedDown") || symbolZoom === -1;
      const isTimelineZoomIn = is("scrollSpeedUp") || symbolZoom === 1;
      const isPreviousBookmark = is("prevBookmark");
      const isNextBookmark = is("nextBookmark");
      const isZoomIn = noMod && is("zoomIn");
      const isZoomOut = noMod && is("zoomOut");
      const isSlow = noMod && is("slowMo");
      const isBookmark = noMod && is("addBookmark");
      const snapDivisor = noMod ? snapDivisorForBind(e.code, binds) : null;
      const snapStep = !noMod ? 0 : is("snapNext") ? 1 : is("snapPrevious") ? -1 : 0;
      const isSnapPreset = noMod && is("snapPreset");
      if (
        !isSpace &&
        !isTab &&
        !isUp &&
        !isDown &&
        !isTimelineZoomOut &&
        !isTimelineZoomIn &&
        !isPreviousBookmark &&
        !isNextBookmark &&
        !isZoomIn &&
        !isZoomOut &&
        !isSlow &&
        !isBookmark &&
        snapDivisor === null &&
        snapStep === 0 &&
        !isSnapPreset
      )
        return;
      if (shouldIgnoreHotkey(e, isSpace)) return;
      // Space in the skin dialog is swallowed even with no audio to play: left
      // to the browser it would press whatever button has focus, and the first
      // one is Close.
      const skinPreviewSpace = isSpace && modalRef.current === "skin";
      if (
        !hasAudioRef.current &&
        !skinPreviewSpace &&
        !isTab &&
        !isTimelineZoomOut &&
        !isTimelineZoomIn &&
        !isZoomIn &&
        !isZoomOut &&
        snapDivisor === null &&
        snapStep === 0 &&
        !isSnapPreset
      )
        return;
      e.preventDefault();
      blurActiveControl();
      if (isTab)
        setZenMode((z) => {
          announceShortcut(osdToggle(t("osd.zenMode"), !z, [editorKeyLabel(binds.zenMode)]));
          return !z;
        });
      else if (isPreviousBookmark) {
        seekBookmark("previous");
        announceShortcut({
          label: t("osd.bookmarks"),
          value: t("osd.previous"),
          keys: [editorKeyLabel(binds.prevBookmark)],
        });
      }
      else if (isNextBookmark) {
        seekBookmark("next");
        announceShortcut({
          label: t("osd.bookmarks"),
          value: t("osd.next"),
          keys: [editorKeyLabel(binds.nextBookmark)],
        });
      }
      else if (isBookmark) {
        if (!e.repeat) {
          addBookmark(Math.round(currentTimeRef.current));
          announceShortcut({
            label: t("osd.bookmarks"),
            value: t("osd.added"),
            keys: [editorKeyLabel(binds.addBookmark)],
          });
        }
      } else if (isSpace) {
        // hasAudio is re-checked because the skin dialog lets Space through
        // even without it, purely to keep it off the focused button.
        if (!e.repeat && hasAudioRef.current) toggleAudio();
      }
      else if (isSlow) {
        if (slowHeldRef.current || e.repeat) return;
        slowHeldRef.current = true;
        setAudioPlaybackRate(0.25);
        announceShortcut(
          osdRange(t("osd.playbackRate"), "25%", 0.25, 0, 1, [editorKeyLabel(binds.slowMo)]),
        );
      }
      else if (isUp || isDown) {
        const volume = Math.max(
          0,
          Math.min(1, audioVolumeRef.current + (isUp ? 0.05 : -0.05)),
        );
        setAudioVolume(volume);
        setVolumeHudKey((value) => value + 1);
      }
      else if (snapStep !== 0 || isSnapPreset) {
        const settings = appSettingsRef.current;
        const custom = settings.customSnapDivisors;
        let preset = presetDivisors(settings.snapPreset, custom).length
          ? settings.snapPreset
          : "common";
        if (isSnapPreset) {
          if (e.repeat) return;
          preset = nextSnapPreset(preset, custom);
          const chosen = preset;
          setAppSettings((s) => ({ ...s, snapPreset: chosen }));
        }
        const divisors = presetDivisors(preset, custom);
        const current = viewRef.current.snapDivisor;
        const next = snapStep !== 0
          ? stepDivisor(divisors, current, snapStep)
          : closestDivisor(divisors, current);
        setView((v) => ({ ...v, snapDivisor: next }));
        announceShortcut({
          label: isSnapPreset ? t("osd.snapPreset") : t("osd.snap"),
          value: isSnapPreset
            ? `${t(`snapPreset.${preset}`)} · 1/${next}`
            : `1/${next}`,
          keys: [editorKeyLabel(e.code)],
        });
      }
      else if (snapDivisor !== null) {
        setView((v) => ({ ...v, snapDivisor }));
        announceShortcut({
          label: t("osd.snap"),
          value: snapDivisor === 0 ? t("transport.snapFree") : `1/${snapDivisor}`,
          keys: [editorKeyLabel(e.code)],
        });
      }
      else if (isTimelineZoomOut || isTimelineZoomIn) {
        setView((v) => {
          const scrollSpeed = Math.max(
            MIN_SCROLL_SPEED,
            Math.min(
              MAX_SCROLL_SPEED,
              v.scrollSpeed + (isTimelineZoomIn ? 1 : -1),
            ),
          );
          announceShortcut(
            osdRange(t("osd.timelineZoom"), String(scrollSpeed), scrollSpeed, MIN_SCROLL_SPEED, MAX_SCROLL_SPEED, [
              editorKeyLabel(binds.scrollSpeedDown),
              editorKeyLabel(binds.scrollSpeedUp),
            ]),
          );
          return { ...v, scrollSpeed };
        });
      } else if (isZoomIn || isZoomOut) {
        setAppSettings((s) => {
          const playfieldScale = Math.round(
            Math.max(
              0.5,
              Math.min(2.5, s.playfieldScale + (isZoomIn ? 0.1 : -0.1)),
            ) * 100,
          ) / 100;
          announceShortcut(
            osdRange(t("osd.playfieldSize"), `${Math.round(playfieldScale * 100)}%`, playfieldScale, MIN_PLAYFIELD_SCALE, MAX_PLAYFIELD_SCALE, [
              editorKeyLabel(binds.zoomOut),
              editorKeyLabel(binds.zoomIn),
            ]),
          );
          return { ...s, playfieldScale };
        });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (
        !matchesBind(e.code, editorKeybindsRef.current.slowMo) ||
        !slowHeldRef.current
      )
        return;
      slowHeldRef.current = false;
      e.preventDefault();
      setAudioPlaybackRate(1);
      announceShortcut(
        osdRange(t("osd.playbackRate"), "100%", 1, 0, 1, [
          editorKeyLabel(editorKeybindsRef.current.slowMo),
        ]),
      );
    };
    const onBlur = () => {
      if (!slowHeldRef.current) return;
      slowHeldRef.current = false;
      setAudioPlaybackRate(1);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    audioVolumeRef,
    currentTimeRef,
    editorKeybindsRef,
    hasAudioRef,
    modalRef,
    playtestRef,
    projectStartedRef,
    setView,
    setVolumeHudKey,
    setZenMode,
    viewRef,
    appSettingsRef,
    setAppSettings,
    t,
    addBookmark,
    announceShortcut,
    askBgScope,
    seekBookmark,
    setAudioPlaybackRate,
    setAudioVolume,
    toggleAudio,
  ]);

  useEffect(() => {
    const onBareAlt = (e: KeyboardEvent) => {
      if (
        e.key !== "Alt" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        isTypingTarget(e.target)
      )
        return;
      e.preventDefault();
      blurActiveControl();
    };
    window.addEventListener("keydown", onBareAlt, true);
    window.addEventListener("keyup", onBareAlt, true);
    return () => {
      window.removeEventListener("keydown", onBareAlt, true);
      window.removeEventListener("keyup", onBareAlt, true);
    };
  }, []);

  useEffect(() => {
    const onDevtoolsKey = (e: KeyboardEvent) => {
      if (e.key !== "F12") return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onDevtoolsKey, true);
    return () => window.removeEventListener("keydown", onDevtoolsKey, true);
  }, []);

  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const saveRef = useRef(handleSave);
  saveRef.current = handleSave;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (playtestRef.current.active) {
        e.preventDefault();
        return;
      }
      const key = e.key.toLowerCase();
      if (key === "s") {
        e.preventDefault();
        void saveRef.current();
        return;
      }
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable;
      if (typing) return;
      if (key === "z") {
        e.preventDefault();
        if (e.shiftKey) redoRef.current();
        else undoRef.current();
      } else if (key === "y") {
        e.preventDefault();
        redoRef.current();
      } else if (key === "g") {
        e.preventDefault();
        if (showChromeRef.current) setJumpToTimeOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [playtestRef, setJumpToTimeOpen, showChromeRef]);
}
