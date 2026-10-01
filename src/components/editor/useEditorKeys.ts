import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { dialogIsOpen } from "../../hooks/useDialog";
import { isClipboardTextTarget } from "../../lib/editorClipboard";
import { DEFAULT_EDITOR_KEYBINDS, matchesBind } from "../../lib/editorKeybinds";
import { HITSOUND_CLAP, HITSOUND_FINISH, HITSOUND_WHISTLE } from "../../types";
import type {
  Clip,
  DragState,
  InteractionMode,
  ManiaEditorProps,
  MoveDragState,
  SelectionDragState,
} from "./editorTypes";

/**
 * The playfield's keys: Esc backing out of a drag, the selection and edit
 * mode in turn; Q for edit and select; selection edits and nudges; copy, cut,
 * paste and select all; hitsound additions; receptors; and whether Shift is
 * held. None of them run while typing or with keyboardShortcuts off.
 */
export function useEditorKeys({
  canvasRef,
  copySelection,
  cutSelection,
  deleteSelection,
  dragRef,
  hitsoundModeRef,
  interactionModeRef,
  keyboardShortcuts,
  markDirty,
  mirrorSelection,
  moveDragRef,
  nudgeSelection,
  openPatternImage,
  pasteFromKeyboard,
  propsRef,
  reverseSelection,
  scaleSelection,
  selectedNoteIdsRef,
  selectionAutoscrollTimeRef,
  selectionDragRef,
  setHitsoundMode,
  setInteractionMode,
  setReceptorsOn,
  setSelection,
  setShiftActive,
  setTailHover,
  shiftActiveRef,
  shuffleSelection,
  toggleAddition,
}: {
  canvasRef: MutableRefObject<HTMLCanvasElement | null>;
  copySelection: () => Clip | null;
  cutSelection: () => void;
  deleteSelection: () => void;
  dragRef: MutableRefObject<DragState | null>;
  hitsoundModeRef: MutableRefObject<boolean>;
  interactionModeRef: MutableRefObject<InteractionMode>;
  keyboardShortcuts: boolean | undefined;
  markDirty: () => void;
  mirrorSelection: () => void;
  moveDragRef: MutableRefObject<MoveDragState | null>;
  nudgeSelection: (dir: "earlier" | "later" | "left" | "right") => void;
  openPatternImage: () => void;
  pasteFromKeyboard: () => void;
  propsRef: MutableRefObject<ManiaEditorProps>;
  reverseSelection: () => void;
  scaleSelection: (factor: number) => void;
  selectedNoteIdsRef: MutableRefObject<Set<string>>;
  selectionAutoscrollTimeRef: MutableRefObject<number | null>;
  selectionDragRef: MutableRefObject<SelectionDragState | null>;
  setHitsoundMode: Dispatch<SetStateAction<boolean>>;
  setInteractionMode: Dispatch<SetStateAction<InteractionMode>>;
  setReceptorsOn: Dispatch<SetStateAction<boolean>>;
  setSelection: (ids: Set<string>) => void;
  setShiftActive: Dispatch<SetStateAction<boolean>>;
  setTailHover: Dispatch<SetStateAction<boolean>>;
  shiftActiveRef: MutableRefObject<boolean>;
  shuffleSelection: () => void;
  toggleAddition: (bit: number) => void;
}) {
  useEffect(() => {
    if (keyboardShortcuts === false) return;
    const setShift = (active: boolean) => {
      shiftActiveRef.current = active;
      setShiftActive(active);
    };
    const isTyping = (target: EventTarget | null) => {
      if (dialogIsOpen()) return true;
      const t = target as HTMLElement | null;
      const tag = t?.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        !!t?.isContentEditable
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      markDirty();
      if (propsRef.current.playtestMode) {
        if (e.key === "Shift") setShift(false);
        return;
      }
      if (e.key === "Shift") setShift(true);
      const binds =
        propsRef.current.editorKeybinds ?? DEFAULT_EDITOR_KEYBINDS;
      const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;
      // Esc steps back one level per press, like osu!lazer: a drag in
      // progress, then the selection, then the placement tool. Only when the
      // playfield itself has focus, so a menu's own Esc isn't doubled up.
      if (
        e.key === "Escape" &&
        noMod &&
        !e.shiftKey &&
        !isTyping(e.target) &&
        (e.target === canvasRef.current || e.target === document.body)
      ) {
        if (dragRef.current || moveDragRef.current || selectionDragRef.current) {
          e.preventDefault();
          dragRef.current = null;
          moveDragRef.current = null;
          selectionDragRef.current = null;
          selectionAutoscrollTimeRef.current = null;
          setTailHover(false);
          markDirty();
          return;
        }
        if (selectedNoteIdsRef.current.size) {
          e.preventDefault();
          setSelection(new Set());
          return;
        }
        if (interactionModeRef.current === "edit" && !propsRef.current.readOnly) {
          e.preventDefault();
          setInteractionMode("select");
          return;
        }
      }
      if (e.code === "KeyQ" && noMod && !isTyping(e.target)) {
        e.preventDefault();
        setInteractionMode((mode) => (mode === "edit" ? "select" : "edit"));
        return;
      }
      if (
        matchesBind(e.code, binds.toggleReceptors) &&
        noMod &&
        !isTyping(e.target)
      ) {
        e.preventDefault();
        setReceptorsOn((on) => !on);
        return;
      }
      if (
        matchesBind(e.code, binds.hitsoundMode) &&
        noMod &&
        !isTyping(e.target)
      ) {
        e.preventDefault();
        setHitsoundMode((on) => !on);
        return;
      }
      if (
        matchesBind(e.code, binds.mirrorSelection) &&
        noMod &&
        !isTyping(e.target) &&
        selectedNoteIdsRef.current.size
      ) {
        e.preventDefault();
        mirrorSelection();
        return;
      }
      if (hitsoundModeRef.current && noMod && !isTyping(e.target)) {
        if (matchesBind(e.code, binds.whistleAdd)) {
          e.preventDefault();
          toggleAddition(HITSOUND_WHISTLE);
          return;
        }
        if (matchesBind(e.code, binds.finishAdd)) {
          e.preventDefault();
          toggleAddition(HITSOUND_FINISH);
          return;
        }
        if (matchesBind(e.code, binds.clapAdd)) {
          e.preventDefault();
          toggleAddition(HITSOUND_CLAP);
          return;
        }
      }
      if (
        matchesBind(e.code, binds.waveformOverlay) &&
        noMod &&
        !isTyping(e.target)
      ) {
        e.preventDefault();
        propsRef.current.onToggleWaveformOverlay?.();
        return;
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        !isTyping(e.target) &&
        selectedNoteIdsRef.current.size
      ) {
        e.preventDefault();
        deleteSelection();
        return;
      }
      if (noMod && !isTyping(e.target) && selectedNoteIdsRef.current.size) {
        if (matchesBind(e.code, binds.reverseSelection)) {
          e.preventDefault();
          reverseSelection();
          return;
        }
        if (matchesBind(e.code, binds.shuffleSelection)) {
          e.preventDefault();
          shuffleSelection();
          return;
        }
        const scaleHalf = matchesBind(e.code, binds.scaleHalf);
        if (scaleHalf || matchesBind(e.code, binds.scaleDouble)) {
          e.preventDefault();
          scaleSelection(scaleHalf ? 0.5 : 2);
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          nudgeSelection(e.key === "ArrowLeft" ? "left" : "right");
          return;
        }
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          // Arrows follow the screen: up moves notes later in downscroll.
          const up = e.key === "ArrowUp";
          const later = propsRef.current.upscroll ? !up : up;
          nudgeSelection(later ? "later" : "earlier");
          return;
        }
      }
      if (
        !(e.ctrlKey || e.metaKey) ||
        e.altKey ||
        dialogIsOpen() ||
        isClipboardTextTarget(e.target)
      ) return;
      const key = e.key.toLowerCase();
      if (key === "c" && e.shiftKey && selectedNoteIdsRef.current.size) {
        e.preventDefault(); openPatternImage();
      } else if (key === "c") {
        if (copySelection()) e.preventDefault();
      } else if (key === "a") {
        e.preventDefault();
        setSelection(new Set(propsRef.current.notes.map((n) => n.id)));
      } else if (key === "x") {
        if (selectedNoteIdsRef.current.size) {
          e.preventDefault();
          cutSelection();
        }
      } else if (key === "v") {
        // Left to the browser, so the native paste delivers the clipboard's
        // text without a permission prompt.
        pasteFromKeyboard();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      markDirty();
      if (propsRef.current.playtestMode) return;
      if (e.key === "Shift") {
        setShift(false);
      }
    };
    const onBlur = () => {
      markDirty();
      setShift(false);
      selectionDragRef.current = null;
      selectionAutoscrollTimeRef.current = null;
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
    canvasRef,
    dragRef,
    hitsoundModeRef,
    interactionModeRef,
    moveDragRef,
    propsRef,
    selectedNoteIdsRef,
    selectionAutoscrollTimeRef,
    selectionDragRef,
    setHitsoundMode,
    setInteractionMode,
    setReceptorsOn,
    setShiftActive,
    setTailHover,
    shiftActiveRef,
    keyboardShortcuts,
    deleteSelection,
    markDirty,
    setSelection,
    copySelection,
    cutSelection,
    pasteFromKeyboard,
    toggleAddition,
    mirrorSelection,
    reverseSelection,
    scaleSelection,
    shuffleSelection,
    nudgeSelection,
    openPatternImage,
  ]);
}
