import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  SNAP_DIVISORS,
  uid,
  HITSOUND_WHISTLE,
  HITSOUND_FINISH,
  HITSOUND_CLAP,
  SAMPLE_SET_NAMES,
  type ManiaKeymodeSkin,
  type ManiaNote,
  type TimingPoint,
  type ViewState,
} from "../types";
import {
  activeTimingAt,
  beatLength,
  gridLineColor,
  gridLinesInRange,
  greenPoints,
  kiaiAt,
  redPoints,
  snapTime,
  stepToSnap,
} from "../lib/timing";
import { buildSvMap, svPositionAt, svTimeAt } from "../lib/sv";
import {
  DEFAULT_EDITOR_KEYBINDS,
  matchesBind,
  type EditorKeybinds,
} from "../lib/editorKeybinds";
import type { PatternNote } from "../lib/patterns";
import type { Waveform } from "../hooks/useWaveform";
import {
  hasNoteCollision,
  hasNoteCollisions,
  withoutNoteCollisions,
} from "../lib/noteCollision";
import {
  mirrorColumns,
  reverseTime,
  scaleTime,
  shuffleColumns,
} from "../lib/noteTools";
import { Menu } from "./ui/Menu";

export type HitsoundSource = {
  id: string;
  name: string;
  hitsoundCount: number;
  noteCount: number;
};

const MANIA_MAX_TIME_RANGE = 11485;
const PLAYHEAD_FROM_BOTTOM = 96;
const NOTE_HEIGHT = 16;
const SELECT_AUTOSCROLL_TOP_ZONE = 64;
const SELECT_EDGE_INSET = 12;
const SELECT_AUTOSCROLL_MIN_PX_PER_SEC = 280;
const SELECT_AUTOSCROLL_MAX_PX_PER_SEC = 900;
const RECEPTOR_HIT_WINDOW = 90;
const NOTE_FALLTHROUGH_FADE_MS = 240;

const BACKGROUND_FADE_DELAY_MS = 700;
const BACKGROUND_FADE_MS = 500;
const SCROLL_SPEED_EASE = 11;
const SCROLL_TIME_EASE = 20;
const CANVAS_FONT_STACK =
  '"Quicksand", "Inter", ui-sans-serif, system-ui, sans-serif';

type Props = {
  notes: ManiaNote[];
  keyCount: number;
  timingPoints: TimingPoint[];
  previewTime: number;
  view: ViewState;
  currentTime: number;
  getCurrentTime: () => number;
  isPlaying: boolean;
  backgroundUrl: string | null;
  videoUrl?: string | null;
  videoOffsetMs?: number;
  playbackRate?: number;
  /**
   * Rate this difficulty's times are written against. Editor times are map
   * times, so anything measured against the raw audio file (waveform buckets,
   * video position) has to be converted through this.
   */
  timeScale?: number;
  dimBackground: number;
  skin: ManiaKeymodeSkin | null;
  playfieldScale: number;
  longNoteBodyScale: number;
  smoothScrolling?: boolean;
  upscroll?: boolean;
  zenMode: boolean;
  onPlaceNote: (note: ManiaNote) => void;
  onDeleteNote: (id: string) => void;
  onAddNotes: (notes: ManiaNote[]) => void;
  onDeleteNotes: (ids: string[]) => void;
  onMoveNotes: (notes: ManiaNote[]) => void;
  onView: (view: ViewState) => void;
  onSeek: (ms: number) => void;
  onVolumeChange: (delta: number) => void;
  currentHitSound: number;
  currentSampleSet: number;
  onCurrentHitSound: (value: number) => void;
  onCurrentSampleSet: (value: number) => void;
  hitsoundSources?: HitsoundSource[];
  onCopyHitsounds?: (sourceId: string) => void;
  onPublishPattern?: (pattern: PatternNote[], keyCount: number) => void;
  pendingClip?: { id: string; pattern: PatternNote[] } | null;
  readOnly?: boolean;
  playtestMode?: boolean;
  heldLnIdsRef?: { readonly current: { has(id: string): boolean } };
  consumedIdsRef?: { readonly current: { has(id: string): boolean } };
  pressedColumnsRef?: { readonly current: { has(column: number): boolean } };
  hitPositionOffset?: number;
  waveformOverlay?: Waveform | null;
  onToggleWaveformOverlay?: () => void;
  missWindowMs?: number;
  hideHints?: boolean;
  bookmarks?: number[];
  showTimingLines?: boolean;
  /** Warp scroll by green-point SV (playtest, or editor playback preview). */
  svPreview?: boolean;
  /** Also scale scroll with BPM, the way osu!mania stable does. */
  svBpmScroll?: boolean;
  /** Reports the time span of the current note selection (for the SV modal). */
  onSelectionRange?: (
    range: { start: number; end: number; count: number } | null,
  ) => void;
  /** Remappable notefield shortcuts; falls back to the defaults. */
  editorKeybinds?: EditorKeybinds;
};

type DragState = {
  column: number;
  startTime: number;
  currentTime: number;
};

type SelectionDragState = {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  currentTime: number;
  rawY: number;
};

type MoveDragState = {
  startX: number;
  startY: number;
  colDelta: number;
  timeDelta: number;
  moved: boolean;
  timeMoved: boolean;
  origin: ({
    id: string;
    column: number;
    startTime: number;
    endTime?: number;
  } & Partial<ManiaNote>)[];
};

type Clip = {
  id: string;
  notes: {
    column: number;
    startTime: number;
    endTime?: number;
    hitSound?: number;
    sampleSet?: number;
    additionSet?: number;
    sampleIndex?: number;
    sampleVolume?: number;
    sampleFile?: string;
  }[];
};

function hitsoundOf(n: {
  hitSound?: number;
  sampleSet?: number;
  additionSet?: number;
  sampleIndex?: number;
  sampleVolume?: number;
  sampleFile?: string;
}): Partial<ManiaNote> {
  return {
    hitSound: n.hitSound,
    sampleSet: n.sampleSet,
    additionSet: n.additionSet,
    sampleIndex: n.sampleIndex,
    sampleVolume: n.sampleVolume,
    sampleFile: n.sampleFile,
  };
}

function hitsoundLabel(hitSound: number | undefined): string {
  if (!hitSound) return "";
  let s = "";
  if (hitSound & HITSOUND_WHISTLE) s += "W";
  if (hitSound & HITSOUND_FINISH) s += "F";
  if (hitSound & HITSOUND_CLAP) s += "C";
  return s;
}

function drawHitsoundLetters(
  ctx: CanvasRenderingContext2D,
  hitSound: number | undefined,
  cx: number,
  cy: number,
) {
  const label = hitsoundLabel(hitSound);
  if (!label) return;
  ctx.save();
  ctx.font = "700 8px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = 2;
  ctx.strokeStyle = "rgba(0,0,0,0.6)";
  ctx.strokeText(label, cx, cy);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(label, cx, cy);
  ctx.restore();
}

type CanvasRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type ColumnRender = {
  colour: string | null;
  note: HTMLImageElement | null;
  head: HTMLImageElement | null;
  body: HTMLImageElement | null;
  bodyCapPx: number | null;
  tail: HTMLImageElement | null;
  key: HTMLImageElement | null;
  keyDown: HTMLImageElement | null;
};

export function ManiaEditor(props: Props) {
  const [shiftActive, setShiftActive] = useState(false);
  const [receptorsOn, setReceptorsOn] = useState(true);
  const receptorsOnRef = useRef(true);
  receptorsOnRef.current = receptorsOn;
  const [hitsoundMode, setHitsoundMode] = useState(false);
  const hitsoundModeRef = useRef(false);
  hitsoundModeRef.current = hitsoundMode;
  // Keep the hitsound bar mounted through its slide-down exit.
  const [hitsoundBarMounted, setHitsoundBarMounted] = useState(false);
  const [hitsoundBarClosing, setHitsoundBarClosing] = useState(false);
  const [selectionCount, setSelectionCount] = useState(0);
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const [history, setHistory] = useState<Clip[]>([]);

  useEffect(() => {
    if (hitsoundMode) {
      setHitsoundBarMounted(true);
      setHitsoundBarClosing(false);
      return;
    }
    if (!hitsoundBarMounted) return;
    setHitsoundBarClosing(true);
    const id = window.setTimeout(() => {
      setHitsoundBarMounted(false);
      setHitsoundBarClosing(false);
    }, 200);
    return () => window.clearTimeout(id);
  }, [hitsoundMode, hitsoundBarMounted]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgFadeStartRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skinColsRef = useRef<ColumnRender[]>([]);
  const shiftActiveRef = useRef(false);
  const selectedNoteIdsRef = useRef<Set<string>>(new Set());
  const clipboardRef = useRef<Clip | null>(null);
  clipboardRef.current = clipboard;

  const lastPendingClipRef = useRef<string | null>(null);
  useEffect(() => {
    const pc = props.pendingClip;
    if (!pc || pc.id === lastPendingClipRef.current) return;
    lastPendingClipRef.current = pc.id;
    const clip: Clip = { id: pc.id, notes: pc.pattern };
    setClipboard(clip);
    setHistory((prev) => [clip, ...prev].slice(0, 8));
  }, [props.pendingClip]);

  const propsRef = useRef(props);
  propsRef.current = props;
  const renderTimeRef = useRef(props.currentTime);
  const liveCurrentTime = useCallback(() => renderTimeRef.current, []);
  const smoothScrollSpeedRef = useRef(props.view.scrollSpeed);
  const smoothScaleRef = useRef(props.playfieldScale || 1);
  const lastMotionFrameRef = useRef(
    typeof performance !== "undefined" ? performance.now() : 0,
  );
  // SV warp eases in/out so toggling playback never snaps note positions.
  // The anchor (scroll position of the playhead) is computed once per frame;
  // timeToY/yToTime would otherwise pay a second binary search per call.
  const svBlendRef = useRef(0);
  const svAnchorPosRef = useRef(0);
  const svMap = useCallback(
    () =>
      buildSvMap(propsRef.current.timingPoints, {
        bpmScroll: propsRef.current.svBpmScroll !== false,
      }),
    [],
  );

  const sizeRef = useRef({ width: 800, height: 600, dpr: 1 });
  const fpsHudRef = useRef({
    show:
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).has("fps"),
    frames: 0,
    windowStart: typeof performance !== "undefined" ? performance.now() : 0,
    fps: 0,
    drawMs: 0,
  });
  const mouseRef = useRef<{ x: number; y: number; inside: boolean }>({
    x: 0,
    y: 0,
    inside: false,
  });
  const dragRef = useRef<DragState | null>(null);
  const selectionDragRef = useRef<SelectionDragState | null>(null);
  const moveDragRef = useRef<MoveDragState | null>(null);
  const selectionAutoscrollTimeRef = useRef<number | null>(null);
  const boxSelectCapturedRef = useRef(false);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const scrubRef = useRef<{ time: number; lastMidY: number } | null>(null);

  const setSelection = useCallback((ids: Set<string>) => {
    selectedNoteIdsRef.current = ids;
    setSelectionCount(ids.size);
    const report = propsRef.current.onSelectionRange;
    if (!report) return;
    if (!ids.size) {
      report(null);
      return;
    }
    let start = Infinity;
    let end = -Infinity;
    for (const n of propsRef.current.notes) {
      if (!ids.has(n.id)) continue;
      if (n.startTime < start) start = n.startTime;
      const tail = n.endTime ?? n.startTime;
      if (tail > end) end = tail;
    }
    report(
      Number.isFinite(start) ? { start, end, count: ids.size } : null,
    );
  }, []);

  useEffect(() => {
    if (!props.playtestMode) return;
    setSelection(new Set());
    shiftActiveRef.current = false;
    setShiftActive(false);
    setHitsoundMode(false);
    mouseRef.current.inside = false;
    dragRef.current = null;
    selectionDragRef.current = null;
    selectionAutoscrollTimeRef.current = null;
    moveDragRef.current = null;
  }, [props.playtestMode, setSelection]);

  const copySelection = useCallback((): Clip | null => {
    const { notes } = propsRef.current;
    const selected = notes.filter((n) => selectedNoteIdsRef.current.has(n.id));
    if (!selected.length) return null;
    const minTime = Math.min(...selected.map((n) => n.startTime));
    const clip: Clip = {
      id: uid("clip"),
      notes: selected
        .map((n) => ({
          column: n.column,
          startTime: n.startTime - minTime,
          endTime: n.endTime !== undefined ? n.endTime - minTime : undefined,
          ...hitsoundOf(n),
        }))
        .sort((a, b) => a.startTime - b.startTime || a.column - b.column),
    };
    setClipboard(clip);
    setHistory((prev) => [clip, ...prev].slice(0, 8));
    return clip;
  }, []);

  const deleteSelection = useCallback(() => {
    const ids = [...selectedNoteIdsRef.current];
    if (!ids.length) return;
    propsRef.current.onDeleteNotes(ids);
    setSelection(new Set());
  }, [liveCurrentTime, setSelection]);

  const cutSelection = useCallback(() => {
    if (copySelection()) deleteSelection();
  }, [copySelection, deleteSelection]);

  const mirrorSelection = useCallback(() => {
    const ids = selectedNoteIdsRef.current;
    if (!ids.size) return;
    const { notes, keyCount } = propsRef.current;
    const selected = notes.filter((n) => ids.has(n.id));
    if (!selected.length) return;
    propsRef.current.onMoveNotes(mirrorColumns(selected, keyCount));
  }, []);

  /**
   * Run a transform over the selected notes and commit it, unless the result
   * would leave the playfield or land on an unselected note. Returns whether
   * the transform was committed.
   */
  const transformSelection = useCallback(
    (
      transform: (selected: ManiaNote[], keyCount: number) => ManiaNote[],
    ): boolean => {
      const ids = selectedNoteIdsRef.current;
      if (!ids.size) return false;
      const { notes, keyCount } = propsRef.current;
      const selected = notes.filter((n) => ids.has(n.id));
      if (!selected.length) return false;
      const moved = transform(selected, keyCount);
      if (moved === selected) return false;
      if (
        moved.some(
          (n) => n.startTime < 0 || n.column < 0 || n.column >= keyCount,
        )
      ) {
        return false;
      }
      const others = notes.filter((n) => !ids.has(n.id));
      if (
        hasNoteCollisions(moved) ||
        moved.some((n) => hasNoteCollision(n, others))
      ) {
        return false;
      }
      propsRef.current.onMoveNotes(moved);
      return true;
    },
    [],
  );

  const reverseSelection = useCallback(() => {
    transformSelection((selected) => reverseTime(selected));
  }, [transformSelection]);

  const scaleSelection = useCallback(
    (factor: number) => {
      transformSelection((selected) => scaleTime(selected, factor));
    },
    [transformSelection],
  );

  const shuffleSelection = useCallback(() => {
    // A shuffle can land on unselected notes; just re-roll a few times.
    for (let attempt = 0; attempt < 10; attempt++) {
      if (transformSelection((sel, keyCount) => shuffleColumns(sel, keyCount))) {
        return;
      }
    }
  }, [transformSelection]);

  const nudgeSelection = useCallback(
    (dir: "earlier" | "later" | "left" | "right") => {
      transformSelection((selected) => {
        if (dir === "left" || dir === "right") {
          const d = dir === "left" ? -1 : 1;
          return selected.map((n) => ({ ...n, column: n.column + d }));
        }
        const { timingPoints, view } = propsRef.current;
        const sign = dir === "later" ? 1 : -1;
        return selected.map((n) => {
          const start = stepToSnap(
            n.startTime,
            timingPoints,
            view.snapDivisor,
            sign,
          );
          const delta = start - n.startTime;
          return {
            ...n,
            startTime: start,
            endTime: n.endTime !== undefined ? n.endTime + delta : undefined,
          };
        });
      });
    },
    [transformSelection],
  );

  const paste = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;
    const { timingPoints, view, keyCount, notes } = propsRef.current;
    const currentTime = liveCurrentTime();
    const base = snapTime(currentTime, timingPoints, view.snapDivisor);
    const newNotes: ManiaNote[] = withoutNoteCollisions(
      clip.notes
        .filter((n) => n.column >= 0 && n.column < keyCount)
        .map((n) => ({
          id: uid("n"),
          column: n.column,
          startTime: n.startTime + base,
          endTime: n.endTime !== undefined ? n.endTime + base : undefined,
          ...hitsoundOf(n),
        })),
      notes,
    );
    if (!newNotes.length) return;
    propsRef.current.onAddNotes(newNotes);
    setSelection(new Set(newNotes.map((n) => n.id)));
  }, [setSelection]);

  const toggleAddition = useCallback((bit: number) => {
    const ids = selectedNoteIdsRef.current;
    if (ids.size) {
      const selected = propsRef.current.notes.filter((n) => ids.has(n.id));
      const allHave = selected.every((n) => ((n.hitSound ?? 0) & bit) !== 0);
      const updated = selected.map((n) => {
        const cur = n.hitSound ?? 0;
        return { ...n, hitSound: (allHave ? cur & ~bit : cur | bit) || undefined };
      });
      propsRef.current.onMoveNotes(updated);
    } else {
      propsRef.current.onCurrentHitSound((propsRef.current.currentHitSound ?? 0) ^ bit);
    }
  }, []);

  const setSampleSet = useCallback((set: number) => {
    propsRef.current.onCurrentSampleSet(set);
    const ids = selectedNoteIdsRef.current;
    if (ids.size) {
      const selected = propsRef.current.notes.filter((n) => ids.has(n.id));
      const updated = selected.map((n) => ({
        ...n,
        sampleSet: set || undefined,
      }));
      propsRef.current.onMoveNotes(updated);
    }
  }, []);

  useEffect(() => {
    const setShift = (active: boolean) => {
      shiftActiveRef.current = active;
      setShiftActive(active);
    };
    const isTyping = (target: EventTarget | null) => {
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
      if (propsRef.current.playtestMode) {
        if (e.key === "Shift") setShift(false);
        return;
      }
      if (e.key === "Shift") setShift(true);
      const binds =
        propsRef.current.editorKeybinds ?? DEFAULT_EDITOR_KEYBINDS;
      const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;
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
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "c") {
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
        if (clipboardRef.current) {
          e.preventDefault();
          paste();
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (propsRef.current.playtestMode) return;
      if (e.key === "Shift") {
        setShift(false);
      }
    };
    const onBlur = () => {
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
    copySelection,
    cutSelection,
    paste,
    toggleAddition,
    mirrorSelection,
    reverseSelection,
    scaleSelection,
    shuffleSelection,
    nudgeSelection,
  ]);

  useEffect(() => {
    if (!props.backgroundUrl) {
      bgImgRef.current = null;
      bgFadeStartRef.current = 0;
      return;
    }
    const img = new Image();
    const url = props.backgroundUrl;
    img.src = props.backgroundUrl;
    img.onload = () => {
      if (propsRef.current.backgroundUrl !== url) return;
      bgImgRef.current = img;
      bgFadeStartRef.current = performance.now();
    };
  }, [props.backgroundUrl]);

  useEffect(() => {
    if (!props.videoUrl) {
      videoRef.current = null;
      return;
    }
    const video = document.createElement("video");
    video.src = props.videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    videoRef.current = video;
    return () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (videoRef.current === video) videoRef.current = null;
    };
  }, [props.videoUrl]);

  useEffect(() => {
    const skin = props.skin;
    if (!skin) {
      skinColsRef.current = [];
      return;
    }
    const cols: ColumnRender[] = skin.columns.map((c) => ({
      colour: c.colour,
      note: null,
      head: null,
      body: null,
      bodyCapPx: c.holdBodyCapPx,
      tail: null,
      key: null,
      keyDown: null,
    }));
    skinColsRef.current = cols;

    let cancelled = false;
    const load = (url: string | null, assign: (img: HTMLImageElement) => void) => {
      if (!url) return;
      const img = new Image();
      img.src = url;
      img.onload = () => {
        if (!cancelled) assign(img);
      };
    };
    skin.columns.forEach((c, i) => {
      load(c.noteUrl, (img) => (cols[i].note = img));
      load(c.holdHeadUrl, (img) => (cols[i].head = img));
      load(c.holdBodyUrl, (img) => (cols[i].body = img));
      load(c.holdTailUrl, (img) => (cols[i].tail = img));
      load(c.keyUrl, (img) => (cols[i].key = img));
      load(c.keyDownUrl, (img) => (cols[i].keyDown = img));
    });
    return () => {
      cancelled = true;
    };
  }, [props.skin]);

  const updateSmoothMotion = useCallback(() => {
    const now = performance.now();
    const last = lastMotionFrameRef.current || now;
    const dt = Math.min(0.08, Math.max(0, (now - last) / 1000));
    lastMotionFrameRef.current = now;

    const targetTime = propsRef.current.getCurrentTime();
    const smooth = propsRef.current.smoothScrolling !== false;
    if (!smooth || propsRef.current.isPlaying) {
      renderTimeRef.current = targetTime;
    } else if (Number.isFinite(targetTime)) {
      const cur = renderTimeRef.current;
      const delta = targetTime - cur;
      if (Math.abs(delta) < 0.4) {
        renderTimeRef.current = targetTime;
      } else {
        renderTimeRef.current =
          cur + delta * (1 - Math.exp(-SCROLL_TIME_EASE * dt));
      }
    }

    const targetScale = propsRef.current.playfieldScale || 1;
    const curScale = smoothScaleRef.current;
    smoothScaleRef.current =
      Math.abs(targetScale - curScale) < 0.002
        ? targetScale
        : curScale + (targetScale - curScale) * (1 - Math.exp(-SCROLL_SPEED_EASE * dt));

    const targetBlend = propsRef.current.svPreview ? 1 : 0;
    const curBlend = svBlendRef.current;
    svBlendRef.current =
      Math.abs(targetBlend - curBlend) < 0.005
        ? targetBlend
        : curBlend +
          (targetBlend - curBlend) * (1 - Math.exp(-SCROLL_SPEED_EASE * dt));
    if (svBlendRef.current > 0) {
      svAnchorPosRef.current = svPositionAt(
        svMap(),
        renderTimeRef.current,
        svBlendRef.current,
      );
    }

    const target = propsRef.current.view.scrollSpeed;
    const current = smoothScrollSpeedRef.current;
    if (!Number.isFinite(target)) return;
    if (Math.abs(target - current) < 0.01) {
      smoothScrollSpeedRef.current = target;
      return;
    }
    const amount = 1 - Math.exp(-SCROLL_SPEED_EASE * dt);
    smoothScrollSpeedRef.current = current + (target - current) * amount;
  }, []);

  const ppms = useCallback(() => {
    const scrollSpeed = smoothScrollSpeedRef.current;
    const visibleHeight = Math.max(1, sizeRef.current.height - PLAYHEAD_FROM_BOTTOM);
    return (visibleHeight * scrollSpeed) / MANIA_MAX_TIME_RANGE;
  }, []);

  const playheadY = useCallback(
    () =>
      propsRef.current.upscroll
        ? PLAYHEAD_FROM_BOTTOM
        : sizeRef.current.height - PLAYHEAD_FROM_BOTTOM,
    [],
  );

  const scrollDir = useCallback(() => (propsRef.current.upscroll ? -1 : 1), []);

  const timeToY = useCallback(
    (t: number) => {
      const blend = svBlendRef.current;
      if (blend <= 0) {
        return playheadY() - scrollDir() * (t - liveCurrentTime()) * ppms();
      }
      return (
        playheadY() -
        scrollDir() *
          (svPositionAt(svMap(), t, blend) - svAnchorPosRef.current) *
          ppms()
      );
    },
    [liveCurrentTime, playheadY, ppms, scrollDir, svMap],
  );

  const yToTime = useCallback(
    (y: number) => {
      const blend = svBlendRef.current;
      if (blend <= 0) {
        return liveCurrentTime() + (scrollDir() * (playheadY() - y)) / ppms();
      }
      // Exact inverse of timeToY — placement and box-select stay usable while
      // playback is warped.
      const pos =
        svAnchorPosRef.current + (scrollDir() * (playheadY() - y)) / ppms();
      return svTimeAt(svMap(), pos, blend);
    },
    [liveCurrentTime, playheadY, ppms, scrollDir, svMap],
  );

  const laneGeometry = useCallback(() => {
    const { width } = sizeRef.current;
    const keys = propsRef.current.keyCount;
    const scale = smoothScaleRef.current || 1;
    const laneWidth = Math.max(
      18,
      Math.min(64, Math.floor((width - 40) / keys)),
    ) * scale;
    const playfieldWidth = laneWidth * keys;
    const originX = Math.floor((width - playfieldWidth) / 2);
    return { laneWidth, playfieldWidth, originX };
  }, []);

  const columnAtX = useCallback(
    (x: number) => {
      const { laneWidth, originX } = laneGeometry();
      const col = Math.floor((x - originX) / laneWidth);
      if (col < 0 || col >= propsRef.current.keyCount) return -1;
      return col;
    },
    [laneGeometry],
  );

  const laneColor = (col: number) =>
    col % 2 === 0 ? "#e9e9f0" : "#5bc0ff";

  const noteColor = (col: number) =>
    skinColsRef.current[col]?.colour ?? laneColor(col);

  const noteBounds = useCallback(
    (
      note: ManiaNote,
      laneWidth: number,
      originX: number,
    ): CanvasRect | null => {
      const { keyCount } = propsRef.current;
      if (note.column < 0 || note.column >= keyCount) return null;
      const x = originX + note.column * laneWidth;
      const cr = skinColsRef.current[note.column];
      const spriteHeight = (img: HTMLImageElement | null | undefined) =>
        img && img.width > 0
          ? (laneWidth - 6) * (img.height / img.width)
          : NOTE_HEIGHT;

      const up = propsRef.current.upscroll === true;
      if (note.endTime !== undefined && note.endTime > note.startTime) {
        const yStart = timeToY(note.startTime);
        const yEnd = timeToY(note.endTime);
        const headH = spriteHeight(cr?.head ?? cr?.note);
        const tailH = spriteHeight(cr?.tail);
        const top = up
          ? Math.min(yStart, yEnd)
          : Math.min(yStart - headH, yEnd - tailH, yEnd);
        const bottom = up
          ? Math.max(yStart + headH, yEnd + tailH, yEnd)
          : Math.max(yStart, yEnd);
        return {
          x: x + 3,
          y: top,
          w: laneWidth - 6,
          h: Math.max(headH, bottom - top),
        };
      }

      const y = timeToY(note.startTime);
      const h = spriteHeight(cr?.note);
      return {
        x: x + 3,
        y: up ? y : y - h,
        w: laneWidth - 6,
        h,
      };
    },
    [timeToY],
  );

  const sortedNotes = useMemo(() => {
    const list = [...props.notes].sort((a, b) => a.startTime - b.startTime);
    let maxDur = 0;
    for (const n of list) {
      if (n.endTime !== undefined) {
        const d = n.endTime - n.startTime;
        if (d > maxDur) maxDur = d;
      }
    }
    return { list, maxDur };
  }, [props.notes]);
  const sortedNotesRef = useRef(sortedNotes);
  sortedNotesRef.current = sortedNotes;

  const overlayPeaks = useMemo(() => {
    const buffer = props.waveformOverlay?.buffer;
    if (!buffer) return null;
    const channel = buffer.getChannelData(0);
    const bucketMs = 2;
    const bucketSamples = Math.max(
      1,
      Math.round((buffer.sampleRate * bucketMs) / 1000),
    );
    const count = Math.ceil(channel.length / bucketSamples);
    const peaks = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const start = i * bucketSamples;
      const end = Math.min(channel.length, start + bucketSamples);
      let sumSq = 0;
      for (let j = start; j < end; j++) sumSq += channel[j] * channel[j];
      peaks[i] = Math.sqrt(sumSq / Math.max(1, end - start));
    }
    const raw = Float32Array.from(peaks);
    for (let i = 0; i < count; i++) {
      const from = Math.max(0, i - 2);
      const to = Math.min(count - 1, i + 2);
      let sum = 0;
      for (let j = from; j <= to; j++) sum += raw[j];
      peaks[i] = sum / (to - from + 1);
    }
    const sorted = Float32Array.from(peaks).sort();
    const ref = sorted[Math.floor(sorted.length * 0.95)] || 1;
    if (ref > 0) {
      for (let i = 0; i < peaks.length; i++) {
        peaks[i] = Math.min(1, peaks[i] / ref);
      }
    }
    return { peaks, bucketMs };
  }, [props.waveformOverlay]);
  const overlayPeaksRef = useRef(overlayPeaks);
  overlayPeaksRef.current = overlayPeaks;

  const firstNoteFrom = useCallback((list: ManiaNote[], t: number) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].startTime < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { width, height, dpr } = sizeRef.current;

    const bw = Math.floor(width * dpr);
    const bh = Math.floor(height * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }

    const { notes, timingPoints, previewTime, view, keyCount } =
      propsRef.current;
    const { laneWidth, playfieldWidth, originX } = laneGeometry();
    const phY = playheadY();
    const up = propsRef.current.upscroll === true;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = "#0f0f14";
    ctx.fillRect(0, 0, width, height);

    const ct = liveCurrentTime();
    const inKiai = kiaiAt(ct, timingPoints);
    let beatFlash = 0;
    if (inKiai) {
      const tp = activeTimingAt(ct, timingPoints);
      const bl = tp ? beatLength(tp.bpm) * 2 : 0;
      if (bl > 0) {
        const phase = ((((ct - tp.time) % bl) + bl) % bl) / bl;
        beatFlash = Math.pow(1 - phase, 2);
      }
    }

    const video = videoRef.current;
    let videoFrame: HTMLVideoElement | null = null;
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      // Map time -> real seconds inside the video file.
      const scale = propsRef.current.timeScale ?? 1;
      const targetSec =
        ((ct - (propsRef.current.videoOffsetMs ?? 0)) * scale) / 1000;
      const rate = (propsRef.current.playbackRate ?? 1) * scale;
      if (video.playbackRate !== rate) video.playbackRate = rate;
      const inRange =
        targetSec >= 0 &&
        (!Number.isFinite(video.duration) || targetSec < video.duration);
      if (propsRef.current.isPlaying && inRange) {
        if (video.paused) {
          video.currentTime = targetSec;
          void video.play().catch(() => {});
        } else if (
          !video.seeking &&
          Math.abs(video.currentTime - targetSec) > 0.2
        ) {
          video.currentTime = targetSec;
        }
      } else {
        if (!video.paused) video.pause();
        if (
          inRange &&
          !video.seeking &&
          Math.abs(video.currentTime - targetSec) > 0.05
        ) {
          video.currentTime = targetSec;
        }
      }
      if (inRange) videoFrame = video;
    }

    const bg = videoFrame ?? bgImgRef.current;
    if (bg) {
      let eased = 1;
      if (!videoFrame) {
        const elapsed =
          performance.now() - bgFadeStartRef.current - BACKGROUND_FADE_DELAY_MS;
        const progress =
          bgFadeStartRef.current > 0
            ? Math.min(1, Math.max(0, elapsed / BACKGROUND_FADE_MS))
            : 1;
        eased = 1 - Math.pow(1 - progress, 3);
      }
      const dimT = Math.max(
        0,
        Math.min(1, (propsRef.current.dimBackground ?? 100) / 100),
      );
      ctx.globalAlpha = eased;
      drawCover(ctx, bg, 0, 0, width, height);
      const overlayAlpha = Math.max(0, Math.min(1, dimT - beatFlash * 0.05)) * eased;
      if (overlayAlpha > 0) {
        ctx.globalAlpha = overlayAlpha;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
      }
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(originX, 0, playfieldWidth, height);

    const skinCols = skinColsRef.current;
    if (skinCols.length) {
      ctx.globalAlpha = 0.16;
      for (let c = 0; c < keyCount; c++) {
        const colour = skinCols[c]?.colour;
        if (!colour) continue;
        ctx.fillStyle = colour;
        ctx.fillRect(originX + c * laneWidth, 0, laneWidth, height);
      }
      ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= keyCount; c++) {
      const x = originX + c * laneWidth + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const overlay = overlayPeaksRef.current;
    if (overlay) {
      const inPlaytest = !!propsRef.current.playtestMode;
      const overlayShift = inPlaytest
        ? propsRef.current.hitPositionOffset ?? 0
        : 0;
      const half = playfieldWidth / 2;
      const cx = originX + half;
      const pad = Math.abs(overlayShift) + 4;
      // Buckets are measured in audio time; the lane is drawn in map time.
      const bucketMs = overlay.bucketMs / (propsRef.current.timeScale ?? 1);
      const stride = Math.max(1, Math.round(3 / (bucketMs * ppms())));
      const strideMs = bucketMs * stride;
      const tA = yToTime(-pad);
      const tB = yToTime(height + pad);
      const lo = Math.max(0, Math.floor(Math.min(tA, tB) / strideMs));
      const hi = Math.min(
        Math.ceil(overlay.peaks.length / stride),
        Math.ceil(Math.max(tA, tB) / strideMs),
      );
      if (hi > lo) {
        ctx.save();
        if (overlayShift) ctx.translate(0, overlayShift);
        const ys: number[] = [];
        const widths: number[] = [];
        for (let i = lo; i <= hi; i++) {
          const from = i * stride;
          const to = Math.min(overlay.peaks.length, from + stride);
          let amp = 0;
          for (let j = from; j < to; j++) {
            if (overlay.peaks[j] > amp) amp = overlay.peaks[j];
          }
          ys.push(timeToY(i * strideMs));
          widths.push(amp * (half - 2));
        }
        ctx.beginPath();
        ctx.moveTo(cx + widths[0], ys[0]);
        for (let i = 1; i < ys.length; i++) ctx.lineTo(cx + widths[i], ys[i]);
        for (let i = ys.length - 1; i >= 0; i--) {
          ctx.lineTo(cx - widths[i], ys[i]);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(125,211,252,0.16)";
        ctx.fill();
        ctx.restore();
      }
    }

    const edgeTimeA = yToTime(0);
    const edgeTimeB = yToTime(height);
    const topTime = Math.max(edgeTimeA, edgeTimeB);
    const bottomTime = Math.min(edgeTimeA, edgeTimeB);
    // A near-frozen SV region (0.01x) inflates the visible time window up to
    // 100x; skip grid lines rather than stroke thousands of them per frame.
    const gridOverload =
      svBlendRef.current > 0.001 &&
      topTime - bottomTime > (4 * height) / ppms();
    if (!propsRef.current.playtestMode && !gridOverload) {
      const lines = gridLinesInRange(
        bottomTime,
        topTime,
        timingPoints,
        view.snapDivisor,
      );
      for (const line of lines) {
        const y = Math.round(timeToY(line.time)) + 0.5;
        if (y < -4 || y > height + 4) continue;
        const color = line.barline
          ? "rgba(255,255,255,0.9)"
          : gridLineColor(line.idxInBeat, view.snapDivisor);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.28;
        ctx.lineWidth = line.barline ? 5 : 4;
        ctx.beginPath();
        ctx.moveTo(originX, y);
        ctx.lineTo(originX + playfieldWidth, y);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = line.barline ? 1.5 : 1;
        ctx.beginPath();
        ctx.moveTo(originX, y);
        ctx.lineTo(originX + playfieldWidth, y);
        ctx.stroke();
      }
    }

    const showTimingLines =
      !propsRef.current.playtestMode &&
      propsRef.current.showTimingLines !== false;

    if (showTimingLines) {
      for (const tp of redPoints(timingPoints)) {
        const y = timeToY(tp.time);
        if (y < -20 || y > height + 20) continue;
        ctx.strokeStyle = "#ff2d6f";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.fillStyle = "#ff2d6f";
        ctx.font = `11px ${CANVAS_FONT_STACK}`;
        ctx.fillText(`${tp.bpm} BPM`, 6, y - 4);
      }

      for (const tp of greenPoints(timingPoints)) {
        const y = timeToY(tp.time);
        if (y < -20 || y > height + 20) continue;
        ctx.strokeStyle = "#2dd4bf";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 4]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = "#2dd4bf";
        ctx.font = `11px ${CANVAS_FONT_STACK}`;
        ctx.fillText(`${tp.sv}× SV`, 6, y + 12);
      }

      if (previewTime >= 0) {
        const y = timeToY(previewTime);
        if (y >= -20 && y <= height + 20) {
          ctx.strokeStyle = "#c084fc";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
          ctx.fillStyle = "#c084fc";
          ctx.font = `11px ${CANVAS_FONT_STACK}`;
          ctx.fillText("Preview Point", 6, y - 4);
        }
      }

      if (propsRef.current.bookmarks?.length) {
        ctx.setLineDash([6, 3]);
        for (const bm of propsRef.current.bookmarks) {
          const y = timeToY(bm);
          if (y < -20 || y > height + 20) continue;
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.stroke();
          ctx.fillStyle = "#fbbf24";
          ctx.font = `11px ${CANVAS_FONT_STACK}`;
          ctx.fillText("Bookmark", 6, y - 4);
        }
        ctx.setLineDash([]);
      }
    }

    if (receptorsOnRef.current) {
      const currentTime = liveCurrentTime();
      const intensities = new Array<number>(keyCount).fill(0);
      const pressed = propsRef.current.playtestMode
        ? propsRef.current.pressedColumnsRef
        : null;
      if (pressed) {
        for (let c = 0; c < keyCount; c++)
          intensities[c] = pressed.current.has(c) ? 1 : 0;
      } else {
        const { list: sorted, maxDur } = sortedNotesRef.current;
        let i = firstNoteFrom(sorted, currentTime - maxDur - RECEPTOR_HIT_WINDOW);
        for (; i < sorted.length; i++) {
          const n = sorted[i];
          if (n.startTime > currentTime) break;
          const c = n.column;
          if (c < 0 || c >= keyCount) continue;
          const start = n.startTime;
          const end = n.endTime ?? n.startTime;
          let inten: number;
          if (currentTime >= start && currentTime <= end) {
            inten = 1;
          } else if (currentTime > end) {
            const d = currentTime - end;
            if (d > RECEPTOR_HIT_WINDOW) continue;
            inten = 1 - d / RECEPTOR_HIT_WINDOW;
          } else {
            continue;
          }
          if (inten > intensities[c]) intensities[c] = inten;
        }
      }
      for (let c = 0; c < keyCount; c++) {
        const cr = skinCols[c];
        const intensity = intensities[c];
        const x = originX + c * laneWidth;
        const sprite = intensity > 0 ? cr?.keyDown ?? cr?.key : cr?.key;
        if (sprite) {
          // Pass the note's opaque display box so a note-shaped receptor can be
          // fitted to (and centred on) the note instead of stretching (see
          // drawReceptor).
          const noteImg = cr?.note ?? cr?.head ?? null;
          let noteBox: { w: number; h: number } | null = null;
          if (noteImg && noteImg.width > 0) {
            const nb = opaqueBounds(noteImg);
            const ns = (laneWidth - 6) / noteImg.width;
            noteBox = {
              w: (nb.right - nb.left) * ns,
              h: (nb.bottom - nb.top) * ns,
            };
          }
          drawReceptor(ctx, sprite, x, phY, laneWidth, up, noteBox);
          if (intensity > 0) {
            drawReceptorGlow(ctx, x, phY, laneWidth, height, noteColor(c), intensity, up);
          }
        } else if (intensity > 0) {
          drawReceptorGlow(ctx, x, phY, laneWidth, height, noteColor(c), intensity, up);
        }
      }
    }

    const clipNotes = receptorsOnRef.current;
    const playtest = !!propsRef.current.playtestMode;
    const heldLnIdsRef = propsRef.current.heldLnIdsRef;
    const consumedIdsRef = propsRef.current.consumedIdsRef;
    const missWindowMs = propsRef.current.missWindowMs ?? 0;
    const move = moveDragRef.current;
    // Derive the cull margin through yToTime so it stays 256px wide even when
    // SV compresses or stretches time near the screen edges.
    const cullEdgeA = yToTime(-256);
    const cullEdgeB = yToTime(height + 256);
    const cullLo = Math.min(cullEdgeA, cullEdgeB);
    const cullHi = Math.max(cullEdgeA, cullEdgeB);

    const vanishTime = Math.min(
      liveCurrentTime(),
      propsRef.current.getCurrentTime(),
    );

    const paintNote = (original: ManiaNote) => {
      if (playtest && consumedIdsRef?.current.has(original.id)) return;
      const selected = selectedNoteIdsRef.current.has(original.id);
      const note =
        move && selected
          ? movedNoteRaw(original, move)
          : original;
      if (note.column < 0 || note.column >= keyCount) return;
      {
        const nA = note.startTime;
        const nB = note.endTime ?? note.startTime;
        const nMin = nA < nB ? nA : nB;
        const nMax = nA < nB ? nB : nA;
        if (nMax < cullLo || nMin > cullHi) return;
      }
      const isLN = note.endTime !== undefined && note.endTime > note.startTime;
      const held = playtest && isLN && !!heldLnIdsRef?.current.has(note.id);
      if (clipNotes && !playtest) {
        const goneAt = isLN ? note.endTime! : note.startTime;
        if (vanishTime > goneAt) return;
      }
      let alpha = 1;
      if (playtest && !held) {
        const sinceMiss = liveCurrentTime() - note.startTime - missWindowMs;
        if (sinceMiss > 0) {
          alpha = 1 - sinceMiss / NOTE_FALLTHROUGH_FADE_MS;
          if (alpha <= 0) return;
        }
      }
      ctx.globalAlpha = alpha;
      const x = originX + note.column * laneWidth;
      const cr = skinCols[note.column];
      const skinColour = skinCols[note.column]?.colour ?? null;
      const noteInKiai = kiaiAt(note.startTime, timingPoints);
      const color =
        noteInKiai && !skinColour
          ? "#5bc0ff"
          : skinColour ?? laneColor(note.column);

      if (selected) {
        const bounds = noteBounds(note, laneWidth, originX);
        if (bounds) {
          ctx.save();
          ctx.fillStyle = "rgba(255,210,63,0.14)";
          ctx.strokeStyle = "rgba(255,210,63,0.95)";
          ctx.lineWidth = 2;
          ctx.shadowColor = "rgba(255,210,63,0.45)";
          ctx.shadowBlur = 8;
          roundRect(
            ctx,
            bounds.x - 4,
            bounds.y - 4,
            bounds.w + 8,
            bounds.h + 8,
            Math.min(10, Math.max(4, bounds.h / 5)),
          );
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      if (note.endTime !== undefined && note.endTime > note.startTime) {
        const yStart = timeToY(note.startTime);
        const yEnd = timeToY(note.endTime);
        const pin = playtest ? held : clipNotes;
        const headY = pin
          ? up
            ? Math.max(yStart, phY)
            : Math.min(yStart, phY)
          : yStart;
        const headSprite = cr?.head ?? cr?.note ?? null;
        const headH =
          headSprite && headSprite.width > 0
            ? (laneWidth - 6) * (headSprite.height / headSprite.width)
            : NOTE_HEIGHT;
        const top = up ? headY + headH / 2 : Math.min(yEnd, headY);
        const bottom = up ? Math.max(yEnd, headY) : headY - headH / 2;
        if (bottom > top) {
          if (cr?.body) {
            const span = Math.max(bottom - top, 1);
            const dispW = laneWidth - 8;
            ctx.save();
            if (up) {
              ctx.translate(0, top + bottom);
              ctx.scale(1, -1);
            }
            if (cr.bodyCapPx && cr.body.width > 0) {
              const scale = dispW / cr.body.width;
              const capH = Math.min(cr.bodyCapPx * scale, span);
              ctx.drawImage(cr.body, 0, 0, cr.body.width, cr.bodyCapPx, x + 4, top, dispW, capH);
              const fillH = span - capH;
              if (fillH > 0) {
                const fillSrcH = Math.max(cr.body.height - cr.bodyCapPx, 1);
                ctx.drawImage(
                  cr.body,
                  0, cr.bodyCapPx, cr.body.width, fillSrcH,
                  x + 4, top + capH, dispW, fillH,
                );
              }
            } else {
              ctx.drawImage(cr.body, x + 4, top, dispW, span);
            }
            ctx.restore();
          } else {
            const kiaiDefault = noteInKiai && !skinColour;
            const bodyW = (laneWidth - 8) * (propsRef.current.longNoteBodyScale || 1);
            ctx.fillStyle = kiaiDefault
              ? "rgba(91,192,255,0.35)"
              : "rgba(154,160,173,0.35)";
            roundRect(
              ctx,
              x + laneWidth / 2 - bodyW / 2,
              top,
              bodyW,
              bottom - top,
              5,
            );
            ctx.fill();
            if (cr?.tail) {
              drawSprite(ctx, cr.tail, x, yEnd, laneWidth, up);
            } else {
              ctx.fillStyle = kiaiDefault ? "#5bc0ff" : "#9aa0ad";
              roundRect(ctx, x + 3, up ? yEnd : yEnd - NOTE_HEIGHT, laneWidth - 6, NOTE_HEIGHT, 4);
              ctx.fill();
            }
          }
        }
        if (headSprite) {
          drawSprite(ctx, headSprite, x, headY, laneWidth, up);
        } else {
          ctx.fillStyle = color;
          roundRect(ctx, x + 3, up ? headY : headY - NOTE_HEIGHT, laneWidth - 6, NOTE_HEIGHT, 4);
          ctx.fill();
          if (hitsoundModeRef.current) {
            drawHitsoundLetters(
              ctx,
              note.hitSound,
              x + laneWidth / 2,
              up ? headY + NOTE_HEIGHT / 2 : headY - NOTE_HEIGHT / 2,
            );
          }
        }
      } else {
        const y = timeToY(note.startTime);
        if (cr?.note) {
          drawSprite(ctx, cr.note, x, y, laneWidth, up);
        } else {
          ctx.fillStyle = color;
          roundRect(ctx, x + 3, up ? y : y - NOTE_HEIGHT, laneWidth - 6, NOTE_HEIGHT, 4);
          ctx.fill();
          if (hitsoundModeRef.current) {
            drawHitsoundLetters(
              ctx,
              note.hitSound,
              x + laneWidth / 2,
              up ? y + NOTE_HEIGHT / 2 : y - NOTE_HEIGHT / 2,
            );
          }
        }
      }
      ctx.globalAlpha = 1;
    };

    const clipAtLine = clipNotes && !playtest;
    if (clipAtLine) {
      ctx.save();
      ctx.beginPath();
      if (up) ctx.rect(originX, phY, playfieldWidth, height - phY);
      else ctx.rect(originX, 0, playfieldWidth, phY);
      ctx.clip();
    }
    const hitPosOffset = playtest ? propsRef.current.hitPositionOffset ?? 0 : 0;
    if (hitPosOffset) {
      ctx.save();
      ctx.translate(0, hitPosOffset);
    }
    if (move) {
      for (const original of notes) paintNote(original);
    } else {
      const { list: sorted, maxDur } = sortedNotesRef.current;
      let i = firstNoteFrom(sorted, cullLo - maxDur);
      for (; i < sorted.length; i++) {
        const n = sorted[i];
        if (n.startTime > cullHi) break;
        paintNote(n);
      }
    }
    if (hitPosOffset) ctx.restore();
    if (clipAtLine) ctx.restore();

    const drag = dragRef.current;
    if (drag) {
      const x = originX + drag.column * laneWidth;
      const yStart = timeToY(drag.startTime);
      const yEnd = timeToY(drag.currentTime);
      const top = Math.min(yStart, yEnd);
      const bottom = Math.max(yStart, yEnd);
      const previewW = (laneWidth - 8) * (propsRef.current.longNoteBodyScale || 1);
      ctx.fillStyle = "rgba(154,160,173,0.25)";
      roundRect(ctx, x + laneWidth / 2 - previewW / 2, top, previewW, Math.max(bottom - top, 2), 5);
      ctx.fill();
    }

    if (
      mouseRef.current.inside &&
      !propsRef.current.readOnly &&
      !propsRef.current.playtestMode &&
      !moveDragRef.current &&
      !selectionDragRef.current &&
      !shiftActiveRef.current
    ) {
      const col = columnAtX(mouseRef.current.x);
      if (col >= 0) {
        const t = yToTime(mouseRef.current.y);
        const x = mouseRef.current.x - laneWidth / 2;
        const y = timeToY(t);
        const ghost = skinCols[0]?.note ?? null;
        if (ghost) {
          drawSprite(ctx, ghost, x, y, laneWidth, up);
        } else {
          ctx.fillStyle = noteColor(0);
          roundRect(ctx, x + 3, up ? y : y - NOTE_HEIGHT, laneWidth - 6, NOTE_HEIGHT, 4);
          ctx.fill();
        }
      }
    }

    const selection = selectionDragRef.current;
    if (selection) {
      const rect = selectionScreenRect(selection);
      const x0 = Math.max(SELECT_EDGE_INSET, rect.x);
      const y0 = Math.max(SELECT_EDGE_INSET, rect.y);
      const x1 = Math.min(width - SELECT_EDGE_INSET, rect.x + rect.w);
      const y1 = Math.min(height - SELECT_EDGE_INSET, rect.y + rect.h);
      const w = x1 - x0;
      const h = y1 - y0;
      if (w > 0 && h > 0) {
        ctx.fillStyle = "rgba(255,210,63,0.12)";
        ctx.fillRect(x0, y0, w, h);
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(x0 + 0.5, y0 + 0.5, w, h);
        ctx.setLineDash([]);
      }
    }

    ctx.strokeStyle = "#e86868";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(originX, phY);
    ctx.lineTo(originX + playfieldWidth, phY);
    ctx.stroke();

    if (inKiai && !propsRef.current.zenMode) {
      const blink = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(performance.now() / 280));
      const alpha = Math.min(1, blink + beatFlash * 0.6);
      const x = originX + playfieldWidth + 10;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#e86868";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = `${12 + beatFlash * 6}px ${CANVAS_FONT_STACK}`;
      ctx.fillText("★", x, phY);
      ctx.font = `bold 13px ${CANVAS_FONT_STACK}`;
      ctx.fillText("KIAI", x + 16, phY);
      ctx.font = `${12 + beatFlash * 6}px ${CANVAS_FONT_STACK}`;
      ctx.fillText("★", x + 52, phY);
      ctx.restore();
    }

    const hud = fpsHudRef.current;
    if (hud.show) {
      const label = `${hud.fps.toFixed(0)} fps · ${hud.drawMs.toFixed(2)} ms draw · ${notes.length} notes`;
      ctx.font = `12px ${CANVAS_FONT_STACK}`;
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillRect(6, 6, tw + 12, 20);
      ctx.fillStyle = "#7CFC00";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(label, 12, 17);
    }

    ctx.restore();
  }, [
    columnAtX,
    laneGeometry,
    liveCurrentTime,
    noteBounds,
    playheadY,
    timeToY,
    yToTime,
  ]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      updateSmoothMotion();
      const hud = fpsHudRef.current;
      if (hud.show) {
        const t0 = performance.now();
        draw();
        hud.drawMs = performance.now() - t0;
        hud.frames++;
        if (t0 - hud.windowStart >= 1000) {
          hud.fps = (hud.frames * 1000) / (t0 - hud.windowStart);
          hud.frames = 0;
          hud.windowStart = t0;
        }
      } else {
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, updateSmoothMotion]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      sizeRef.current = {
        width: rect.width,
        height: rect.height,
        dpr: window.devicePixelRatio || 1,
      };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const localPoint = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };


  const findNoteAt = (x: number, y: number): ManiaNote | null => {
    const { notes, keyCount } = propsRef.current;
    const col = columnAtX(x);
    if (col < 0) return null;
    const { laneWidth, originX } = laneGeometry();
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n.column !== col || n.column >= keyCount) continue;
      const bounds = noteBounds(n, laneWidth, originX);
      if (
        bounds &&
        x >= bounds.x &&
        x <= bounds.x + bounds.w &&
        y >= bounds.y &&
        y <= bounds.y + bounds.h
      ) {
        return n;
      }
    }
    return null;
  };

  const selectNotesInRect = (rect: CanvasRect) => {
    const { notes } = propsRef.current;
    const { laneWidth, originX } = laneGeometry();
    const next = new Set<string>();

    for (const note of notes) {
      const bounds = noteBounds(note, laneWidth, originX);
      if (bounds && rectIntersects(rect, bounds)) next.add(note.id);
    }

    setSelection(next);
  };

  const movedNoteRaw = (
    note: ManiaNote,
    move: Pick<MoveDragState, "colDelta" | "timeDelta">,
  ): ManiaNote => ({
    ...note,
    column: note.column + move.colDelta,
    startTime: note.startTime + move.timeDelta,
    endTime:
      note.endTime !== undefined ? note.endTime + move.timeDelta : undefined,
  });

  const movedNoteSnapped = (
    note: ManiaNote,
    move: Pick<MoveDragState, "colDelta" | "timeDelta" | "timeMoved">,
  ): ManiaNote => {
    const raw = movedNoteRaw(note, move);
    if (!move.timeMoved) return raw;
    const { timingPoints, view } = propsRef.current;
    const startTime = snapTime(raw.startTime, timingPoints, view.snapDivisor);
    let endTime =
      raw.endTime !== undefined
        ? snapTime(raw.endTime, timingPoints, view.snapDivisor)
        : undefined;
    if (endTime !== undefined && endTime <= startTime) {
      endTime = stepToSnap(startTime, timingPoints, view.snapDivisor, 1);
    }
    return {
      ...raw,
      startTime,
      endTime,
    };
  };

  function selectionScreenRect(selection: SelectionDragState): CanvasRect {
    return normalizeRect(
      selection.startX,
      timeToY(selection.startTime),
      selection.currentX,
      timeToY(selection.currentTime),
    );
  }

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const selection = selectionDragRef.current;
      if (!selection) {
        selectionAutoscrollTimeRef.current = null;
        last = now;
        raf = requestAnimationFrame(tick);
        return;
      }

      const { height } = sizeRef.current;
      const phY = playheadY();
      const up = propsRef.current.upscroll === true;
      const y = selection.currentY;
      const rawY = selection.rawY;
      let dir: 1 | -1 | 0 = 0;
      let intensity = 0;

      if (!up) {
        if (rawY < SELECT_AUTOSCROLL_TOP_ZONE) {
          dir = 1;
          intensity = Math.min(
            1,
            (SELECT_AUTOSCROLL_TOP_ZONE - rawY) / SELECT_AUTOSCROLL_TOP_ZONE,
          );
        } else if (rawY > phY) {
          dir = -1;
          intensity = Math.min(1, (rawY - phY) / Math.max(1, height - phY));
        }
      } else {
        const futureEdge = height - SELECT_AUTOSCROLL_TOP_ZONE;
        if (rawY > futureEdge) {
          dir = 1;
          intensity = Math.min(
            1,
            (rawY - futureEdge) / SELECT_AUTOSCROLL_TOP_ZONE,
          );
        } else if (rawY < phY) {
          dir = -1;
          intensity = Math.min(1, (phY - rawY) / Math.max(1, phY));
        }
      }

      if (dir !== 0 && intensity > 0) {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        const pxPerSec =
          SELECT_AUTOSCROLL_MIN_PX_PER_SEC +
          (SELECT_AUTOSCROLL_MAX_PX_PER_SEC -
            SELECT_AUTOSCROLL_MIN_PX_PER_SEC) *
            intensity;
        const baseTime =
          selectionAutoscrollTimeRef.current ??
          liveCurrentTime();
        const nextTime = Math.max(
          0,
          baseTime + dir * (pxPerSec / ppms()) * dt,
        );
        selectionAutoscrollTimeRef.current = nextTime;
        selection.currentTime = nextTime + ((up ? -1 : 1) * (phY - y)) / ppms();
        propsRef.current.onSeek(nextTime);
      } else {
        selectionAutoscrollTimeRef.current = null;
      }

      last = now;
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [liveCurrentTime, playheadY, ppms]);

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (props.playtestMode) {
      e.preventDefault();
      return;
    }
    const { x, y } = localPoint(e);
    if (props.readOnly && !(e.shiftKey || shiftActiveRef.current)) return;
    if (e.shiftKey || shiftActiveRef.current) {
      e.preventDefault();
      dragRef.current = null;
      selectionDragRef.current = {
        startX: x,
        startY: y,
        startTime: yToTime(y),
        currentX: x,
        currentY: y,
        currentTime: yToTime(y),
        rawY: y,
      };
      setSelection(new Set());
      return;
    }

    const hit = findNoteAt(x, y);
    if (hit) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const ids = new Set(selectedNoteIdsRef.current);
        if (ids.has(hit.id)) ids.delete(hit.id);
        else ids.add(hit.id);
        setSelection(ids);
        return;
      }

      let ids = selectedNoteIdsRef.current;
      if (!ids.has(hit.id)) {
        ids = new Set([hit.id]);
        setSelection(ids);
      }
      const origin = propsRef.current.notes
        .filter((n) => ids.has(n.id))
        .map((n) => ({
          id: n.id,
          column: n.column,
          startTime: n.startTime,
          endTime: n.endTime,
          ...hitsoundOf(n),
        }));
      moveDragRef.current = {
        startX: x,
        startY: y,
        colDelta: 0,
        timeDelta: 0,
        moved: false,
        timeMoved: false,
        origin,
      };
      return;
    }

    if (selectedNoteIdsRef.current.size) setSelection(new Set());
    const col = columnAtX(x);
    if (col < 0) return;
    const { timingPoints, view } = propsRef.current;
    const t = snapTime(yToTime(y), timingPoints, view.snapDivisor);
    dragRef.current = { column: col, startTime: t, currentTime: t };
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (props.playtestMode) return;
    const { x, y } = localPoint(e);
    mouseRef.current = { x, y, inside: true };
    const selection = selectionDragRef.current;
    if (selection) {
      const { width, height } = sizeRef.current;
      const cx = Math.max(SELECT_EDGE_INSET, Math.min(x, width - SELECT_EDGE_INSET));
      const cy = Math.max(SELECT_EDGE_INSET, Math.min(y, height - SELECT_EDGE_INSET));
      selection.currentX = cx;
      selection.currentY = cy;
      selection.rawY = y;
      selection.currentTime = yToTime(cy);
      return;
    }

    const move = moveDragRef.current;
    if (move) {
      const { keyCount } = propsRef.current;
      const { laneWidth } = laneGeometry();

      const rawDelta = yToTime(y) - yToTime(move.startY);
      if (move.timeMoved || Math.abs(y - move.startY) > 3) {
        move.timeMoved = true;
        move.timeDelta = rawDelta;
      } else {
        move.timeDelta = 0;
      }

      let colDelta = Math.round((x - move.startX) / laneWidth);
      const cols = move.origin.map((o) => o.column);
      const minCol = Math.min(...cols);
      const maxCol = Math.max(...cols);
      if (minCol + colDelta < 0) colDelta = -minCol;
      if (maxCol + colDelta > keyCount - 1) colDelta = keyCount - 1 - maxCol;
      move.colDelta = colDelta;

      if (Math.abs(x - move.startX) > 3 || Math.abs(y - move.startY) > 3) {
        move.moved = true;
      }
      return;
    }

    const drag = dragRef.current;
    if (drag) {
      const { timingPoints, view } = propsRef.current;
      drag.currentTime = snapTime(yToTime(y), timingPoints, view.snapDivisor);
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (props.playtestMode) {
      e.preventDefault();
      return;
    }

    const move = moveDragRef.current;
    if (move) {
      moveDragRef.current = null;
      if (
        move.moved &&
        (move.colDelta !== 0 || move.timeDelta !== 0 || move.timeMoved)
      ) {
        const updated = move.origin.map((o) => movedNoteSnapped(o, move));
        const byId = new Map(updated.map((n) => [n.id, n]));
        const nextNotes = propsRef.current.notes.map((n) => byId.get(n.id) ?? n);
        if (!hasNoteCollisions(nextNotes)) {
          propsRef.current.onMoveNotes(updated);
        }
      }
      return;
    }

    const selection = selectionDragRef.current;
    if (selection) {
      selectionDragRef.current = null;
      selectionAutoscrollTimeRef.current = null;
      selectNotesInRect(selectionScreenRect(selection));
      return;
    }

    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    const start = Math.min(drag.startTime, drag.currentTime);
    const end = Math.max(drag.startTime, drag.currentTime);
    const id = uid("n");
    const hs: Partial<ManiaNote> = {};
    if (propsRef.current.currentHitSound) hs.hitSound = propsRef.current.currentHitSound;
    if (propsRef.current.currentSampleSet) hs.sampleSet = propsRef.current.currentSampleSet;

    const note: ManiaNote =
      end - start <= 0
        ? { id, column: drag.column, startTime: start, ...hs }
        : {
            id,
            column: drag.column,
            startTime: start,
            endTime: end,
            ...hs,
          };
    if (!withoutNoteCollisions([note], propsRef.current.notes).length) return;
    props.onPlaceNote(note);
  };

  const onMouseLeave = () => {
    mouseRef.current.inside = false;
    dragRef.current = null;
    moveDragRef.current = null;
    if (!boxSelectCapturedRef.current) {
      selectionDragRef.current = null;
      selectionAutoscrollTimeRef.current = null;
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (props.playtestMode) return;
    const { x, y } = localPoint(e);
    const note = findNoteAt(x, y);
    if (!note) return;

    if (selectedNoteIdsRef.current.has(note.id)) {
      deleteSelection();
    } else {
      propsRef.current.onDeleteNote(note.id);
    }
  };

  const averagePointerY = (pts: Map<number, { x: number; y: number }>) => {
    let sum = 0;
    for (const p of pts.values()) sum += p.y;
    return pts.size ? sum / pts.size : 0;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      onMouseDown(e);
      if (selectionDragRef.current) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
          boxSelectCapturedRef.current = true;
        } catch {
        }
      }
      return;
    }
    if (props.playtestMode) return;
    e.preventDefault();
    const pts = activePointersRef.current;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
    }
    if (pts.size >= 2) {
      dragRef.current = null;
      moveDragRef.current = null;
      selectionDragRef.current = null;
      scrubRef.current = {
        time: propsRef.current.getCurrentTime(),
        lastMidY: averagePointerY(pts),
      };
      return;
    }
    onMouseDown(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      onMouseMove(e);
      return;
    }
    const pts = activePointersRef.current;
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const scrub = scrubRef.current;
    if (scrub && pts.size >= 2) {
      const midY = averagePointerY(pts);
      const dy = midY - scrub.lastMidY;
      scrub.lastMidY = midY;
      // Deliberately time-domain (ignores SV warp) so scrub speed is steady.
      const msPerPx = -scrollDir() / ppms();
      scrub.time = Math.max(0, scrub.time - msPerPx * dy);
      propsRef.current.onSeek(scrub.time);
      return;
    }
    onMouseMove(e);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      if (boxSelectCapturedRef.current) {
        boxSelectCapturedRef.current = false;
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
        }
      }
      onMouseUp(e);
      return;
    }
    const pts = activePointersRef.current;
    pts.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
    }
    if (scrubRef.current) {
      if (pts.size < 2) scrubRef.current = null;
      return;
    }
    onMouseUp(e);
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      if (boxSelectCapturedRef.current) {
        boxSelectCapturedRef.current = false;
        selectionDragRef.current = null;
        selectionAutoscrollTimeRef.current = null;
      }
      return;
    }
    activePointersRef.current.delete(e.pointerId);
    scrubRef.current = null;
    if (activePointersRef.current.size === 0) onMouseLeave();
  };

  const onPointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") onMouseLeave();
  };

  const onWheel = (e: React.WheelEvent) => {
    if (props.playtestMode) {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const { view } = propsRef.current;
      const currentIndex = SNAP_DIVISORS.indexOf(view.snapDivisor);
      const dir = e.deltaY > 0 ? -1 : 1;
      const nextIndex = Math.min(
        SNAP_DIVISORS.length - 1,
        Math.max(0, currentIndex + dir),
      );
      if (nextIndex !== currentIndex) {
        propsRef.current.onView({
          ...view,
          snapDivisor: SNAP_DIVISORS[nextIndex],
        });
      }
      return;
    }

    if (e.altKey) {
      props.onVolumeChange(e.deltaY < 0 ? 0.05 : -0.05);
      return;
    }
    const { timingPoints, view } = propsRef.current;
    const currentTime = propsRef.current.getCurrentTime();
    const dir: 1 | -1 = e.deltaY < 0 ? -1 : 1;
    const firstStep = stepToSnap(currentTime, timingPoints, view.snapDivisor, dir);
    // While playing, playback keeps advancing between reading the time and the
    // seek landing, so a single snap step gets overtaken and scrolling feels
    // stuck. Step an extra snap in the scroll direction to compensate - for both
    // directions, so forward and backward scrolling both work during playback.
    const target = propsRef.current.isPlaying
      ? stepToSnap(firstStep, timingPoints, view.snapDivisor, dir)
      : firstStep;
    props.onSeek(target);
  };

  const selectedNotes =
    selectionCount > 0
      ? props.notes.filter((n) => selectedNoteIdsRef.current.has(n.id))
      : [];
  const toolbarHasAddition = (bit: number) =>
    selectedNotes.length > 0
      ? selectedNotes.every((n) => ((n.hitSound ?? 0) & bit) !== 0)
      : (props.currentHitSound & bit) !== 0;
  const toolbarSampleSet =
    selectedNotes.length > 0
      ? selectedNotes.every(
          (n) => (n.sampleSet ?? 0) === (selectedNotes[0].sampleSet ?? 0),
        )
        ? selectedNotes[0].sampleSet ?? 0
        : -1
      : props.currentSampleSet;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden"
      onContextMenu={onContextMenu}
    >
      <canvas
        ref={canvasRef}
        className={`block h-full w-full touch-none ${
          props.playtestMode ? "cursor-default" : "cursor-crosshair"
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
      />
      {!props.hideHints && !props.playtestMode && (
        <div
          className={`pointer-events-none absolute right-3 top-3 select-none rounded-md border border-yellow-300/40 bg-yellow-500/15 px-3 py-1.5 text-xs font-medium text-yellow-100 shadow-lg transition-[opacity,transform] duration-150 ${
            shiftActive
              ? "translate-y-0 opacity-100"
              : "-translate-y-2 opacity-0"
          }`}
        >
          Multi selection active
        </div>
      )}

      {!props.hideHints && !props.playtestMode && (
        <div
          className={`pointer-events-none absolute left-3 top-3 select-none rounded-md border px-3 py-1.5 text-xs font-medium shadow-lg transition-[opacity,transform] duration-150 ${
            receptorsOn
              ? "border-emerald-300/40 bg-emerald-500/15 text-emerald-100"
              : "border-slate-400/25 bg-ink-800/70 text-slate-200"
          }`}
        >
          Receptors {receptorsOn ? "on" : "off"} · press R
        </div>
      )}

      {selectionCount > 0 && !props.playtestMode && (
        <div className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 select-none items-center gap-1 rounded-lg border border-yellow-300/30 bg-ink-800/92 p-1 text-[11px] text-slate-200 shadow-xl backdrop-blur">
          <span className="font-medium text-yellow-200">
            {selectionCount} selected
          </span>
          <span className="mx-0.5 h-4 w-px bg-white/10" />
          <SelectionActionButton
            label="←"
            title="Move one lane left (Left Arrow)"
            onClick={() => nudgeSelection("left")}
          />
          <SelectionActionButton
            label="−t"
            title="Move one snap earlier (Up/Down Arrow follows scroll direction)"
            onClick={() => nudgeSelection("earlier")}
          />
          <SelectionActionButton
            label="+t"
            title="Move one snap later (Up/Down Arrow follows scroll direction)"
            onClick={() => nudgeSelection("later")}
          />
          <SelectionActionButton
            label="→"
            title="Move one lane right (Right Arrow)"
            onClick={() => nudgeSelection("right")}
          />
          <SelectionActionButton
            label="Mirror"
            title="Mirror columns (M)"
            onClick={mirrorSelection}
          />
          <SelectionActionButton
            label="Reverse"
            title="Reverse timing (F)"
            onClick={reverseSelection}
          />
          <SelectionActionButton
            label="Shuffle"
            title="Shuffle columns (S)"
            onClick={shuffleSelection}
          />
          <SelectionActionButton
            label="½"
            title="Halve pattern timing ([)"
            onClick={() => scaleSelection(0.5)}
          />
          <SelectionActionButton
            label="2×"
            title="Double pattern timing (])"
            onClick={() => scaleSelection(2)}
          />
          <SelectionActionButton
            label="Delete"
            title="Delete selection (Delete)"
            danger
            onClick={deleteSelection}
          />
        </div>
      )}

      {!props.playtestMode && (clipboard || history.length > 0) && (
        <div className="absolute right-3 top-14 w-44 select-none rounded-lg border border-ink-600 bg-ink-800/90 p-2 text-xs text-slate-300 shadow-xl backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-medium text-slate-200">Clipboard</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setClipboard(null);
                  setHistory([]);
                }}
                className="rounded px-1 py-0.5 text-[10px] text-slate-500 transition hover:bg-ink-600 hover:text-slate-200"
                title="Clear the clipboard and pasteboard history"
              >
                Clear
              </button>
              <span className="text-[10px] text-slate-500">Ctrl+V</span>
            </div>
          </div>
          {clipboard ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 rounded-md border border-yellow-300/40 bg-yellow-500/5 p-1.5">
                <ClipThumb clip={clipboard} keyCount={props.keyCount} />
                <span className="text-[10px] text-slate-400">
                  {clipboard.notes.length} note
                  {clipboard.notes.length === 1 ? "" : "s"}
                </span>
              </div>
              {props.onPublishPattern && (
                <button
                  type="button"
                  onClick={() =>
                    props.onPublishPattern?.(
                      clipboard.notes,
                      props.keyCount,
                    )
                  }
                  className="rounded-md border border-ink-600 bg-ink-700/60 px-2 py-1 text-[10px] font-medium text-slate-200 transition hover:border-accent/60 hover:bg-ink-600"
                  title="Publish this copied pattern as a shared preset"
                >
                  Save as preset…
                </button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">Nothing copied yet</p>
          )}

          {history.length > 1 && (
            <>
              <div className="mb-1 mt-2.5 text-[10px] uppercase tracking-wide text-slate-500">
                Pasteboard
              </div>
              <div className="flex flex-col gap-1">
                {history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setClipboard(item)}
                    className={`flex items-center gap-2 rounded-md border px-1.5 py-1 text-left transition ${
                      item.id === clipboard?.id
                        ? "border-yellow-300/50 bg-yellow-500/10"
                        : "border-ink-600 bg-ink-700/40 hover:border-slate-500"
                    }`}
                  >
                    <ClipThumb clip={item} keyCount={props.keyCount} small />
                    <span className="text-[10px] text-slate-400">
                      {item.notes.length} note
                      {item.notes.length === 1 ? "" : "s"}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {hitsoundBarMounted && !props.zenMode && (
        <div
          className={`absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-ink-600 bg-ink-800/90 px-2.5 py-1.5 text-xs text-slate-200 shadow-xl backdrop-blur ${
            hitsoundBarClosing ? "hitsound-bar-out" : "hitsound-bar-in"
          }`}
        >
          <span className="font-medium text-slate-300">Hitsound</span>
          <div className="flex gap-1">
            {SAMPLE_SET_NAMES.map((name, s) => (
              <button
                key={name}
                onClick={() => setSampleSet(s)}
                className={`rounded px-2 py-0.5 capitalize transition ${
                  toolbarSampleSet === s
                    ? "bg-accent text-ink-900"
                    : "bg-ink-700 text-slate-300 hover:bg-ink-600"
                }`}
                title={
                  s === 0 ? "Auto (use timing point)" : `${name} sample set`
                }
              >
                {s === 0 ? "Auto" : name}
              </button>
            ))}
          </div>
          <span className="text-slate-600">·</span>
          <div className="flex gap-1">
            <HitsoundAddBtn
              label="W"
              title="Whistle (W)"
              active={toolbarHasAddition(HITSOUND_WHISTLE)}
              onClick={() => toggleAddition(HITSOUND_WHISTLE)}
            />
            <HitsoundAddBtn
              label="F"
              title="Finish (F)"
              active={toolbarHasAddition(HITSOUND_FINISH)}
              onClick={() => toggleAddition(HITSOUND_FINISH)}
            />
            <HitsoundAddBtn
              label="C"
              title="Clap (C)"
              active={toolbarHasAddition(HITSOUND_CLAP)}
              onClick={() => toggleAddition(HITSOUND_CLAP)}
            />
          </div>
          <span className="text-[10px] text-slate-500">
            {selectionCount > 0
              ? `→ ${selectionCount} selected`
              : "→ new notes"}
          </span>
          {props.onCopyHitsounds && (props.hitsoundSources?.length ?? 0) > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <Menu
                label="Copy from"
                className="!rounded !bg-ink-700 !px-2 !py-0.5 !text-xs hover:!bg-ink-600"
                items={(props.hitsoundSources ?? []).map((s) => ({
                  label: `${s.name} (${s.hitsoundCount} hitsounded)`,
                  disabled: s.hitsoundCount === 0,
                  onClick: () => props.onCopyHitsounds?.(s.id),
                  title:
                    s.hitsoundCount === 0
                      ? "This difficulty has no hitsounds"
                      : `Copy hitsounds from ${s.name} onto this difficulty`,
                }))}
              />
            </>
          )}
          <span className="text-slate-600">·</span>
          <span className="text-[10px] text-slate-500">press H to exit</span>
        </div>
      )}
    </div>
  );
}

function HitsoundAddBtn({
  label,
  title,
  active,
  onClick,
}: {
  label: string;
  title: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-6 rounded py-0.5 font-semibold transition ${
        active
          ? "bg-emerald-500/80 text-ink-900"
          : "bg-ink-700 text-slate-300 hover:bg-ink-600"
      }`}
    >
      {label}
    </button>
  );
}

type ClipPreviewSize = "small" | "normal" | "large";

function ClipPreview({
  clip,
  keyCount,
  size = "normal",
}: {
  clip: Clip;
  keyCount: number;
  size?: ClipPreviewSize;
}) {
  const cellW = size === "small" ? 5 : size === "large" ? 18 : 8;
  const w = Math.max(1, keyCount) * cellW;
  const h = size === "small" ? 22 : size === "large" ? 160 : 44;
  const pad = size === "large" ? 6 : 3;
  const maxTime = Math.max(
    1,
    ...clip.notes.map((n) => n.endTime ?? n.startTime),
  );
  const ty = (t: number) => h - pad - (t / maxTime) * (h - 2 * pad);
  const riceH = size === "large" ? 6 : 3;
  return (
    <svg
      width={w}
      height={h}
      className="shrink-0 rounded bg-ink-900/70"
      aria-hidden
    >
      {clip.notes.map((n, i) => {
        const x = n.column * cellW + 0.5;
        if (n.endTime !== undefined && n.endTime > n.startTime) {
          const top = ty(n.endTime);
          const bottom = ty(n.startTime);
          return (
            <rect
              key={i}
              x={x}
              y={top}
              width={cellW - 1}
              height={Math.max(2, bottom - top)}
              rx={1}
              fill="#e86868"
              opacity={0.85}
            />
          );
        }
        return (
          <rect
            key={i}
            x={x}
            y={ty(n.startTime) - riceH / 2}
            width={cellW - 1}
            height={riceH}
            rx={1}
            fill={n.column % 2 === 0 ? "#e9e9f0" : "#5bc0ff"}
          />
        );
      })}
    </svg>
  );
}

function SelectionActionButton({
  label,
  title,
  danger = false,
  onClick,
}: {
  label: string;
  title: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded px-1.5 py-1 text-[10px] font-medium transition ${
        danger
          ? "text-rose-300 hover:bg-rose-500/15 hover:text-rose-200"
          : "text-slate-300 hover:bg-white/10 hover:text-white"
      }`}
    >
      {label}
    </button>
  );
}

function ClipThumb({
  clip,
  keyCount,
  small,
}: {
  clip: Clip;
  keyCount: number;
  small?: boolean;
}) {
  return (
    <span className="group/clip relative shrink-0">
      <ClipPreview
        clip={clip}
        keyCount={keyCount}
        size={small ? "small" : "normal"}
      />
      <span className="pointer-events-none absolute right-full top-1/2 z-30 mr-2 -translate-y-1/2 rounded-md border border-ink-500 bg-ink-900/95 p-2 opacity-0 shadow-2xl transition-opacity duration-150 group-hover/clip:opacity-100">
        <ClipPreview clip={clip} keyCount={keyCount} size="large" />
      </span>
    </span>
  );
}

function normalizeRect(x1: number, y1: number, x2: number, y2: number): CanvasRect {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  return {
    x,
    y,
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
  };
}

function rectIntersects(a: CanvasRect, b: CanvasRect): boolean {
  return (
    a.x <= b.x + b.w &&
    a.x + a.w >= b.x &&
    a.y <= b.y + b.h &&
    a.y + a.h >= b.y
  );
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawSprite(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  bottomY: number,
  laneWidth: number,
  flip = false,
) {
  const w = laneWidth - 6;
  const h = img.width > 0 ? img.height * (w / img.width) : NOTE_HEIGHT;
  if (flip) {
    ctx.save();
    ctx.translate(0, bottomY + h);
    ctx.scale(1, -1);
    ctx.drawImage(img, x + 3, 0, w, h);
    ctx.restore();
    return;
  }
  ctx.drawImage(img, x + 3, bottomY - h, w, h);
}

type OpaqueBounds = { left: number; top: number; right: number; bottom: number };
const opaqueBoundsCache = new WeakMap<HTMLImageElement, OpaqueBounds>();
// Bounding box of the non-transparent content, so receptors with lots of empty
// canvas padding (common in arrow / note-shaped receptor skins) can be sized and
// aligned by their visible pixels rather than the raw image edges.
function opaqueBounds(img: HTMLImageElement): OpaqueBounds {
  const cached = opaqueBoundsCache.get(img);
  if (cached) return cached;
  let result: OpaqueBounds = { left: 0, top: 0, right: img.width, bottom: img.height };
  try {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext("2d", { willReadFrequently: true });
    if (cx) {
      cx.drawImage(img, 0, 0);
      const { data } = cx.getImageData(0, 0, img.width, img.height);
      let left = img.width;
      let right = 0;
      let top = img.height;
      let bottom = 0;
      let any = false;
      for (let y = 0; y < img.height; y++) {
        for (let x = 0; x < img.width; x++) {
          if (data[(y * img.width + x) * 4 + 3] > 8) {
            any = true;
            if (x < left) left = x;
            if (x > right) right = x;
            if (y < top) top = y;
            if (y > bottom) bottom = y;
          }
        }
      }
      if (any) result = { left, top, right: right + 1, bottom: bottom + 1 };
    }
  } catch {
    // keep full-image fallback
  }
  opaqueBoundsCache.set(img, result);
  return result;
}

function drawReceptor(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  lineY: number,
  laneWidth: number,
  up = false,
  // The note's opaque display box (width/height in canvas px). A note-shaped
  // receptor - one whose visible pixels are much taller than the note, e.g. an
  // arrow or ring the note falls into - is fitted to this box and centred on the
  // note, matching how osu! renders it (a tall oval ring becomes a round ring the
  // size of the note). Normal/flat key images keep the old "opaque bottom on the
  // hit line" placement, so ordinary skins render exactly as before.
  noteBox?: { w: number; h: number } | null,
) {
  if (img.width <= 0 || img.height <= 0) return;
  const s = laneWidth / img.width;
  const b = opaqueBounds(img);
  const opaqueDisplayH = (b.bottom - b.top) * s;

  if (noteBox && noteBox.h > 0 && opaqueDisplayH > noteBox.h * 1.15) {
    const srcW = b.right - b.left;
    const srcH = b.bottom - b.top;
    const cx = x + laneWidth / 2;
    const cy = up ? lineY + noteBox.h / 2 : lineY - noteBox.h / 2;
    if (up) {
      ctx.save();
      ctx.translate(0, lineY * 2);
      ctx.scale(1, -1);
      ctx.drawImage(
        img, b.left, b.top, srcW, srcH,
        cx - noteBox.w / 2, lineY * 2 - (cy + noteBox.h / 2), noteBox.w, noteBox.h,
      );
      ctx.restore();
    } else {
      ctx.drawImage(
        img, b.left, b.top, srcW, srcH,
        cx - noteBox.w / 2, cy - noteBox.h / 2, noteBox.w, noteBox.h,
      );
    }
    return;
  }

  // Default: aspect-preserving, opaque bottom anchored on the hit line.
  const dy = lineY - b.bottom * s;
  if (up) {
    ctx.save();
    ctx.translate(0, lineY * 2);
    ctx.scale(1, -1);
    ctx.drawImage(img, x, dy, laneWidth, img.height * s);
    ctx.restore();
    return;
  }
  ctx.drawImage(img, x, dy, laneWidth, img.height * s);
}

function drawReceptorGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  lineY: number,
  laneWidth: number,
  canvasHeight: number,
  color: string,
  intensity = 1,
  up = false,
) {
  const h = up ? lineY : canvasHeight - lineY;
  if (h <= 0 || intensity <= 0) return;
  const farY = up ? lineY - h : lineY + h;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = 0.55 * intensity;
  const grad = ctx.createLinearGradient(0, lineY, 0, farY);
  grad.addColorStop(0, color);
  grad.addColorStop(1, "transparent");
  ctx.fillStyle = grad;
  ctx.fillRect(x, Math.min(lineY, farY), laneWidth, h);
  ctx.restore();
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const w = img instanceof HTMLVideoElement ? img.videoWidth : img.width;
  const h = img instanceof HTMLVideoElement ? img.videoHeight : img.height;
  const ir = w / h;
  const r = dw / dh;
  let sw = w;
  let sh = h;
  if (ir > r) {
    sw = h * r;
  } else {
    sh = w / r;
  }
  const sx = (w - sw) / 2;
  const sy = (h - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
