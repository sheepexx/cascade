import { PLAYHEAD_FROM_EDGE } from "../lib/playfieldGeometry";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  SNAP_OPTIONS,
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
  noteSnapColour,
  noteSnapDivisor,
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
import { notesToPattern, type PatternNote } from "../lib/patterns";
import {
  isClipboardTextTarget,
  NOTE_CLIP_DRAG_TYPE,
  positionPatternForDrop,
  prepareNotePaste,
} from "../lib/editorClipboard";
import {
  formatOsuClock,
  formatOsuTimestamp,
  notesAtOsuTimestamp,
  parseOsuTimestamp,
  type OsuTimestamp,
} from "../lib/osuTimestamp";
import { catchPastedText } from "../lib/pasteText";
import {
  activeClip,
  clearClipboard,
  getClipboard,
  pushClip,
  selectClip,
  useClipboard,
  type DifficultyClip,
  type NoteClip,
} from "../lib/clipboardStore";
import { defaultLaneColour, type LaneColourScheme } from "../lib/laneColours";
import type { Waveform } from "../hooks/useWaveform";
import {
  consumeLocalSeekSignal,
  type AudioSeekRequest,
  type AudioSeekSignal,
  type AudioSeekTransition,
} from "../lib/audioSeek";
import { computeWaveformOverlay } from "../lib/waveform";
import { dialogIsOpen } from "../hooks/useDialog";
import {
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
import { SnapBadge } from "./ui/SnapBadge";
import { DifficultyClipLabel } from "./ui/DifficultyClipLabel";
import { t } from "../lib/i18n/core";
import { FONT_STACK as CANVAS_FONT_STACK } from "../lib/fontStack";
import { formatUiNumber } from "../lib/formatUiNumber";
import {
  reduceMotion,
  renderScale,
  usePerformanceMode,
} from "../lib/performanceMode";
import { useGhostNotes } from "../hooks/useGhostNotes";
import { GhostNotesPanel } from "./GhostNotesPanel";
import { PatternImageModal } from "./menus/PatternImageModal";
import type { renderPatternCard } from "../lib/shareCard";

export type HitsoundSource = {
  id: string;
  name: string;
  hitsoundCount: number;
  noteCount: number;
};

const MANIA_MAX_TIME_RANGE = 11485;
const PLAYHEAD_FROM_BOTTOM = PLAYHEAD_FROM_EDGE;
const NOTE_HEIGHT = 16;
const SELECT_AUTOSCROLL_TOP_ZONE = 64;
const SELECT_EDGE_INSET = 12;
/** How far from a long note's tail a press still grabs it for resizing. */
const LN_TAIL_GRAB_PX = 8;
const SELECT_AUTOSCROLL_MIN_PX_PER_SEC = 280;
const SELECT_AUTOSCROLL_MAX_PX_PER_SEC = 900;
const RECEPTOR_HIT_WINDOW = 90;
const NOTE_FALLTHROUGH_FADE_MS = 240;

const BOUND_HATCH_STEP = 15;
const BOUND_HATCH_ALPHA = 0.14;
const BOUND_TINT_ALPHA = 0.05;
const BOUND_SONG_RGB = "239,68,68";
const BOUND_TRIM_RGB = "245,158,11";

const BACKGROUND_FADE_DELAY_MS = 700;
const BACKGROUND_FADE_MS = 500;
const SCROLL_SPEED_EASE = 11;
const PARALLAX_PX = 10;
const PARALLAX_EASE = 7;

type Props = {
  audioBuffer?: AudioBuffer | null;
  patternTitle?: string;
  difficultyName?: string;
  notes: ManiaNote[];
  keyCount: number;
  timingPoints: TimingPoint[];
  previewTime: number;
  view: ViewState;
  getCurrentTime: () => number;
  getVisualCurrentTime: (frameNow?: number) => number;
  isVisualSeekActive: (frameNow?: number) => boolean;
  isPlaying: boolean;
  seekSignal?: AudioSeekSignal;
  backgroundUrl: string | null;
  /** Identifies the picture itself, so the same image on another difficulty
   * carries over instead of fading in again. Defaults to the URL. */
  backgroundKey?: string | null;
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
  /** Blur on the background picture, in pixels; 0 leaves it sharp. */
  backgroundBlur?: number;
  /** Lane waveform transparency, 0–100%; 75 keeps the original look. */
  waveformTransparency?: number;
  skin: ManiaKeymodeSkin | null;
  playfieldScale: number;
  noteHeightScale: number;
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
  onSeek: (ms: number, transition?: AudioSeekTransition) => void;
  currentHitSound: number;
  currentSampleSet: number;
  onCurrentHitSound: (value: number) => void;
  onCurrentSampleSet: (value: number) => void;
  hitsoundSources?: HitsoundSource[];
  onCopyHitsounds?: (sourceId: string) => void;
  /** Default-skin note colours: the usual set or the colourblind one. */
  laneColourScheme?: LaneColourScheme;
  /** Notes take the colour of their beat divisor instead of their lane's. */
  snapColours?: boolean;
  /** A lane to light up briefly; `at` is a performance.now() timestamp. */
  laneFlash?: { column: number; at: number } | null;
  /** Copies this difficulty's hitsounds onto every difficulty on the same audio. */
  onCopyHitsoundsToAll?: () => void;
  onPublishPattern?: (pattern: PatternNote[], keyCount: number) => void;
  /** Adds a difficulty pasted from the clipboard, with its files, to the open map. */
  onPasteDifficulty?: (clip: DifficultyClip) => void;
  /** For the reference playfield, which has nothing to paste into. */
  hideClipboard?: boolean;
  readOnly?: boolean;
  keyboardShortcuts?: boolean;
  playtestMode?: boolean;
  heldLnIdsRef?: { readonly current: { has(id: string): boolean } };
  consumedIdsRef?: { readonly current: { has(id: string): boolean } };
  pressedColumnsRef?: { readonly current: { has(column: number): boolean } };
  /**
   * Playtest only: pixels the judgement line sits further from the screen
   * edge. Receptors, notes and judging all use that line.
   */
  hitPosition?: number;
  /**
   * Filled with where the playfield and its judgement line are, in CSS pixels
   * of the canvas, every frame; the HUD editor lays its handles over them.
   */
  playfieldBoundsRef?: {
    current: { left: number; width: number; hitY: number; height: number } | null;
  };
  /** Long notes let go or missed, drawn dimmed as they scroll by. */
  droppedIdsRef?: { readonly current: { has(id: string): boolean } };
  waveformOverlay?: Waveform | null;
  onToggleWaveformOverlay?: () => void;
  missWindowMs?: number;
  hideHints?: boolean;
  bookmarks?: number[];
  /** Length of the loaded audio in map time; bounds the playable range. */
  songEndMs?: number;
  trimStartMs?: number;
  trimEndMs?: number;
  showTimingLines?: boolean;
  /** Warp scroll by green-point SV (playtest, or editor playback preview). */
  svPreview?: boolean;
  /** Also scale scroll with BPM, the way osu!mania stable does. */
  svBpmScroll?: boolean;
  /** Reports the current note selection: its time span (for the SV modal) and ids. */
  onSelectionRange?: (
    range: {
      start: number;
      end: number;
      count: number;
      ids: ReadonlySet<string>;
    } | null,
  ) => void;
  /** Remappable notefield shortcuts; falls back to the defaults. */
  editorKeybinds?: EditorKeybinds;
  ghostNotes?: boolean;
  onGhostNotes?: (enabled: boolean) => void;
};

/**
 * Times a note may occupy: inside the audio file, and inside the trim when the
 * difficulty has one. Notes already outside it (a trim set after mapping) are
 * left alone; this only stops new ones being put there.
 */
function playableBounds(props: Props): { lo: number; hi: number } {
  const songEnd = props.songEndMs ?? 0;
  let hi = songEnd > 0 ? songEnd : Infinity;
  if (props.trimEndMs !== undefined) hi = Math.min(hi, props.trimEndMs);
  return { lo: Math.max(0, props.trimStartMs ?? 0), hi };
}

type DragState = {
  column: number;
  startTime: number;
  currentTime: number;
  replace?: ManiaNote;
  /** Dragging an existing long note's tail; currentTime is its new end. */
  resize?: boolean;
};

type InteractionMode = "edit" | "select";

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

type Clip = NoteClip;

type ClipDropPreview = {
  clip: Clip;
  column: number;
  base: number;
  notes: ManiaNote[];
  timingPoints: TimingPoint[];
  keyCount: number;
  snapDivisor: number;
  lo: number;
  hi: number;
  result: ReturnType<typeof prepareNotePaste>;
  acceptedIds: Set<string>;
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
  ctx.font = `700 8px ${CANVAS_FONT_STACK}`;
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

// The editor remounts for every difficulty; the last background it drew
// survives that so an unchanged picture neither blinks nor fades.
let shownBackground: { key: string; img: HTMLImageElement } | null = null;

export function ManiaEditor(props: Props) {
  const [interactionMode, setInteractionMode] = useState<InteractionMode>("edit");
  const interactionModeRef = useRef<InteractionMode>("edit");
  interactionModeRef.current = interactionMode;
  const [shiftActive, setShiftActive] = useState(false);
  // Over a long note's tail, or dragging one: the cursor shows it resizes.
  const [tailHover, setTailHover] = useState(false);
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
  // One clipboard for the whole app, so a copy survives switching difficulty
  // or project.
  const clipboardState = useClipboard();
  const clipboard = activeClip(clipboardState);
  const history = clipboardState.entries;
  const [clipboardStatus, setClipboardStatus] = useState("");

  useEffect(() => {
    if (!clipboardStatus) return;
    const timer = window.setTimeout(() => setClipboardStatus(""), 6000);
    return () => window.clearTimeout(timer);
  }, [clipboardStatus]);

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
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const lowSpec = usePerformanceMode();
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgFadeStartRef = useRef(0);
  const parallaxRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoSeekTargetRef = useRef<number | null>(null);
  const skinColsRef = useRef<ColumnRender[]>([]);
  const shiftActiveRef = useRef(false);
  const selectedNoteIdsRef = useRef<Set<string>>(new Set());
  const propsRef = useRef(props);
  propsRef.current = props;
  const [patternImage, setPatternImage] = useState<Parameters<typeof renderPatternCard>[0] | null>(null);
  const review = useGhostNotes({
    buffer: props.audioBuffer ?? null, notes: props.notes, timingPoints: props.timingPoints,
    snapDivisor: props.view.snapDivisor, timeScale: props.timeScale ?? 1, keyCount: props.keyCount,
    start: Math.max(0, props.trimStartMs ?? 0), end: Math.min(props.songEndMs || Infinity, props.trimEndMs ?? Infinity),
    onAdd: props.onAddNotes,
    enabled: !!props.ghostNotes, onEnabled: (on) => props.onGhostNotes?.(on),
  });
  useEffect(() => {
    if (props.ghostNotes && !props.readOnly) canvasRef.current?.focus({ preventScroll: true });
  }, [props.ghostNotes, props.readOnly]);
  const reviewRef = useRef(review);
  reviewRef.current = review;
  const openPatternImage = useCallback(() => {
    const p = propsRef.current;
    const notes = p.notes.filter(n => selectedNoteIdsRef.current.has(n.id));
    if (notes.length) setPatternImage({ notes, keyCount: p.keyCount, timingPoints: p.timingPoints,
      title: p.patternTitle ?? t("editor.patternSelection"), difficulty: p.difficultyName ?? "", upscroll: p.upscroll });
  }, []);
  const dirtyRef = useRef(true);
  dirtyRef.current = true;
  const scheduleFrameRef = useRef<() => void>(() => {});
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    scheduleFrameRef.current();
  }, []);
  // A render only flags the canvas, and the frame loop sleeps while nothing
  // moves, so settings changed from the Settings modal draw a frame here.
  useEffect(() => {
    markDirty();
  }, [
    props.waveformTransparency,
    props.dimBackground,
    props.backgroundBlur,
    markDirty,
  ]);
  const renderTimeRef = useRef(
    props.smoothScrolling === false
      ? props.getCurrentTime()
      : props.getVisualCurrentTime(),
  );
  const seenSeekRevisionRef = useRef(props.seekSignal?.revision ?? 0);
  const pendingInteractiveSeekRef = useRef<{
    time: number;
    transition: AudioSeekTransition;
  } | null>(null);
  const interactiveSeekRafRef = useRef(0);
  const locallyFlushedSeekRef = useRef<AudioSeekRequest[]>([]);
  const liveCurrentTime = useCallback(() => renderTimeRef.current, []);
  const smoothScrollSpeedRef = useRef(props.view.scrollSpeed);
  // A run starts at its own scroll speed instead of easing into it.
  const scrollModeRef = useRef(props.playtestMode);
  if (scrollModeRef.current !== props.playtestMode) {
    scrollModeRef.current = props.playtestMode;
    smoothScrollSpeedRef.current = props.view.scrollSpeed;
  }
  const smoothScaleRef = useRef(props.playfieldScale || 1);
  const lastMotionFrameRef = useRef(
    typeof performance !== "undefined" ? performance.now() : 0,
  );

  const flushInteractiveSeek = useCallback(() => {
    if (interactiveSeekRafRef.current) {
      cancelAnimationFrame(interactiveSeekRafRef.current);
      interactiveSeekRafRef.current = 0;
    }
    const pending = pendingInteractiveSeekRef.current;
    pendingInteractiveSeekRef.current = null;
    if (!pending) return;

    locallyFlushedSeekRef.current.push(pending);
    if (locallyFlushedSeekRef.current.length > 8) {
      locallyFlushedSeekRef.current.shift();
    }
    propsRef.current.onSeek(pending.time, pending.transition);
    markDirty();
  }, [markDirty]);

  const scheduleInteractiveSeek = useCallback(
    (time: number, transition: AudioSeekTransition) => {
      pendingInteractiveSeekRef.current = { time, transition };
      if (!interactiveSeekRafRef.current) {
        interactiveSeekRafRef.current = requestAnimationFrame(
          flushInteractiveSeek,
        );
      }
    },
    [flushInteractiveSeek],
  );

  useEffect(
    () => () => {
      cancelAnimationFrame(interactiveSeekRafRef.current);
      interactiveSeekRafRef.current = 0;
      pendingInteractiveSeekRef.current = null;
      locallyFlushedSeekRef.current = [];
    },
    [],
  );

  useLayoutEffect(() => {
    const signal = props.seekSignal;
    if (!signal || signal.revision === seenSeekRevisionRef.current) return;
    seenSeekRevisionRef.current = signal.revision;

    const remainingLocalSeeks = consumeLocalSeekSignal(
      locallyFlushedSeekRef.current,
      signal,
    );
    if (remainingLocalSeeks !== null) {
      locallyFlushedSeekRef.current = remainingLocalSeeks;
      markDirty();
      return;
    }

    // An external timeline seek always wins over input that is merely queued
    // inside this canvas.
    locallyFlushedSeekRef.current = [];
    cancelAnimationFrame(interactiveSeekRafRef.current);
    interactiveSeekRafRef.current = 0;
    pendingInteractiveSeekRef.current = null;
    markDirty();
  }, [props.seekSignal, markDirty]);

  const getCurrentTimeProp = props.getCurrentTime;
  const timeScaleProp = props.timeScale;
  const isPlayingProp = props.isPlaying;
  useEffect(() => {
    const now = performance.now();
    const targetTime =
      propsRef.current.smoothScrolling === false
        ? getCurrentTimeProp()
        : propsRef.current.getVisualCurrentTime(now);
    if (!Number.isFinite(targetTime)) return;
    renderTimeRef.current = targetTime;
    markDirty();
  }, [getCurrentTimeProp, timeScaleProp, isPlayingProp, markDirty]);
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
  const draggedClipRef = useRef<Clip | null>(null);
  const clipDropPreviewRef = useRef<ClipDropPreview | null>(null);
  const selectionAutoscrollTimeRef = useRef<number | null>(null);
  const selectionAutoscrollRafRef = useRef(0);
  const boxSelectCapturedRef = useRef(false);

  const focusCanvas = () => {
    const el = canvasRef.current;
    if (!el) return;
    el.dataset.pointerFocus = "";
    el.focus({ preventScroll: true });
  };
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const scrubRef = useRef<{ time: number; lastMidY: number } | null>(null);

  const clearClipDrag = useCallback(() => {
    draggedClipRef.current = null;
    clipDropPreviewRef.current = null;
    markDirty();
  }, [markDirty]);

  useEffect(() => {
    window.addEventListener("dragend", clearClipDrag);
    window.addEventListener("blur", clearClipDrag);
    return () => {
      window.removeEventListener("dragend", clearClipDrag);
      window.removeEventListener("blur", clearClipDrag);
    };
  }, [clearClipDrag]);

  useEffect(() => {
    if (props.readOnly || props.playtestMode) clearClipDrag();
  }, [props.readOnly, props.playtestMode, clearClipDrag]);

  const setSelection = useCallback((ids: Set<string>) => {
    selectedNoteIdsRef.current = ids;
    setSelectionCount(ids.size);
    markDirty();
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
      Number.isFinite(start) ? { start, end, count: ids.size, ids } : null,
    );
  }, [markDirty]);

  useLayoutEffect(() => {
    const selected = selectedNoteIdsRef.current;
    if (!selected.size) return;
    setSelection(
      new Set(props.notes.filter((n) => selected.has(n.id)).map((n) => n.id)),
    );
  }, [props.notes, setSelection]);

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

  const inBounds = useCallback((from: number, to = from) => {
    const { lo, hi } = playableBounds(propsRef.current);
    return from >= lo - 0.5 && to <= hi + 0.5;
  }, []);

  const copySelection = useCallback((): Clip | null => {
    const { notes, timingPoints } = propsRef.current;
    const selected = notes.filter((n) => selectedNoteIdsRef.current.has(n.id));
    if (!selected.length) {
      setClipboardStatus(t("editor.selectToCopy"));
      return null;
    }
    const timestamp = formatOsuTimestamp(selected, timingPoints) ?? undefined;
    const clip: Clip = {
      kind: "notes",
      id: uid("clip"),
      notes: notesToPattern(selected, timingPoints),
      timestamp,
    };
    pushClip(clip);
    // The system clipboard gets the osu! timestamp, as stable's editor copies
    // it, so the selection pastes into a modding post or Discord as a link.
    if (timestamp) void navigator.clipboard?.writeText(timestamp).catch(() => {});
    setClipboardStatus(
      t("editor.copiedNotes", { count: selected.length }),
    );
    return clip;
  }, []);

  const deleteSelection = useCallback(() => {
    if (propsRef.current.readOnly) return;
    const ids = [...selectedNoteIdsRef.current];
    if (!ids.length) return;
    propsRef.current.onDeleteNotes(ids);
    setSelection(new Set());
  }, [setSelection]);

  const cutSelection = useCallback(() => {
    if (propsRef.current.readOnly) return;
    if (copySelection()) deleteSelection();
  }, [copySelection, deleteSelection]);

  /**
   * Run a transform over the selected notes and commit it, unless the result
   * would leave the playfield or land on an unselected note. Returns whether
   * the transform was committed.
   */
  const transformSelection = useCallback(
    (
      transform: (selected: ManiaNote[], keyCount: number) => ManiaNote[],
    ): boolean => {
      if (propsRef.current.readOnly) return false;
      const ids = selectedNoteIdsRef.current;
      if (!ids.size) return false;
      const { notes, keyCount } = propsRef.current;
      const selected = notes.filter((n) => ids.has(n.id));
      if (!selected.length) return false;
      const moved = transform(selected, keyCount);
      if (moved === selected) return false;
      const boundedIds = new Set(
        selected
          .filter((n) => inBounds(n.startTime, n.endTime ?? n.startTime))
          .map((n) => n.id),
      );
      if (
        moved.some(
          (n) =>
            n.startTime < 0 ||
            n.column < 0 ||
            n.column >= keyCount ||
            (!inBounds(n.startTime, n.endTime ?? n.startTime) &&
              boundedIds.has(n.id)),
        )
      ) {
        return false;
      }
      const movedById = new Map(moved.map((note) => [note.id, note]));
      const next = notes.map((n) => movedById.get(n.id) ?? n);
      if (hasNoteCollisions(next)) {
        return false;
      }
      propsRef.current.onMoveNotes(moved);
      return true;
    },
    [inBounds],
  );

  const mirrorSelection = useCallback(() => {
    transformSelection(mirrorColumns);
  }, [transformSelection]);

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
    if (propsRef.current.readOnly) return;
    const clip = activeClip(getClipboard());
    if (!clip) {
      setClipboardStatus(t("editor.copyBeforePaste"));
      return;
    }
    if (clip.kind === "difficulty") {
      propsRef.current.onPasteDifficulty?.(clip);
      return;
    }
    const { timingPoints, view, keyCount, notes } = propsRef.current;
    const currentTime =
      pendingInteractiveSeekRef.current?.time ?? propsRef.current.getCurrentTime();
    const result = prepareNotePaste(
      clip.notes,
      currentTime,
      keyCount,
      timingPoints,
      view.snapDivisor,
      notes,
      playableBounds(propsRef.current),
    );
    setClipboardStatus(result.message);
    if (!result.notes.length) return;
    propsRef.current.onAddNotes(result.notes);
    setSelection(new Set(result.notes.map((n) => n.id)));
  }, [setSelection]);

  /** Jumps to an osu! timestamp and selects the notes it names that are here. */
  const goToOsuTimestamp = useCallback(
    (stamp: OsuTimestamp) => {
      const { notes, timingPoints } = propsRef.current;
      pendingInteractiveSeekRef.current = null;
      propsRef.current.onSeek(stamp.time);
      const clock = formatOsuClock(stamp.time);
      const named = stamp.notes.length;
      if (!named) {
        setClipboardStatus(t("editor.jumped", { clock }));
        return;
      }
      const found = notesAtOsuTimestamp(stamp, notes, timingPoints);
      setSelection(new Set(found.map((n) => n.id)));
      setClipboardStatus(
        found.length >= named
          ? t("editor.jumpedSelected", { clock, count: named })
          : found.length
            ? t("editor.jumpedSomeSelected", { clock, found: found.length, count: named })
            : named === 1
              ? t("editor.jumpedNoteMissing", { clock })
              : t("editor.jumpedNotesMissing", { clock, count: named }),
      );
    },
    [setSelection],
  );

  /**
   * Ctrl+V: an osu! timestamp or osu://edit link on the system clipboard, from
   * a modding thread or Discord, jumps to it and selects its notes. Anything
   * else, including the timestamp Cascade's own copy left there, pastes the
   * copied notes as before.
   */
  const pasteFromKeyboard = useCallback(() => {
    const canvas = canvasRef.current;
    const pointerFocus = canvas?.dataset.pointerFocus;
    void catchPastedText().then((text) => {
      // The hidden paste field blurred the canvas; keep its focus ring as it was.
      if (canvas && pointerFocus !== undefined && document.activeElement === canvas) {
        canvas.dataset.pointerFocus = pointerFocus;
      }
      const stamp = text ? parseOsuTimestamp(text) : null;
      // Any copy in the pasteboard counts, not just the active one: picking an
      // older entry leaves the newest copy's timestamp on the system clipboard.
      const ownCopy =
        !!text &&
        getClipboard().entries.some(
          (e) => e.kind === "notes" && e.timestamp?.trim() === text.trim(),
        );
      if (stamp && !ownCopy) goToOsuTimestamp(stamp);
      else paste();
    });
  }, [goToOsuTimestamp, paste]);

  const toggleAddition = useCallback((bit: number) => {
    if (propsRef.current.readOnly) return;
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
    if (propsRef.current.readOnly) return;
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
    if (props.keyboardShortcuts === false) return;
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
      if (!propsRef.current.readOnly && !dialogIsOpen() && e.target === canvasRef.current && reviewRef.current.onKey(e)) return;
      if (e.key === "Shift") setShift(true);
      const binds =
        propsRef.current.editorKeybinds ?? DEFAULT_EDITOR_KEYBINDS;
      const noMod = !e.ctrlKey && !e.metaKey && !e.altKey;
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
    props.keyboardShortcuts,
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

  useEffect(() => {
    if (!props.backgroundUrl) {
      bgImgRef.current = null;
      bgFadeStartRef.current = 0;
      shownBackground = null;
      return;
    }
    const url = props.backgroundUrl;
    const key = props.backgroundKey ?? url;
    if (shownBackground?.key === key) {
      bgImgRef.current = shownBackground.img;
      bgFadeStartRef.current = 0;
      markDirty();
      return;
    }
    const img = new Image();
    img.src = url;
    img.onload = () => {
      if (propsRef.current.backgroundUrl !== url) return;
      shownBackground = { key, img };
      bgImgRef.current = img;
      bgFadeStartRef.current = performance.now();
      markDirty();
    };
  }, [props.backgroundUrl, props.backgroundKey, markDirty]);

  useEffect(() => {
    if (!props.videoUrl) {
      videoRef.current = null;
      videoSeekTargetRef.current = null;
      return;
    }
    const video = document.createElement("video");
    video.src = props.videoUrl;
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    const onSeeked = () => {
      videoSeekTargetRef.current = null;
      markDirty();
    };
    video.addEventListener("loadeddata", markDirty);
    video.addEventListener("seeked", onSeeked);
    videoRef.current = video;
    return () => {
      video.removeEventListener("loadeddata", markDirty);
      video.removeEventListener("seeked", onSeeked);
      video.pause();
      video.removeAttribute("src");
      video.load();
      if (videoRef.current === video) {
        videoRef.current = null;
        videoSeekTargetRef.current = null;
      }
    };
  }, [props.videoUrl, markDirty]);

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
        if (cancelled) return;
        assign(img);
        markDirty();
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
  }, [props.skin, markDirty]);

  const updateSmoothMotion = useCallback((frameNow = performance.now()) => {
    const now = frameNow;
    const last = lastMotionFrameRef.current || now;
    const elapsedSeconds = Math.max(0, (now - last) / 1000);
    const dt = Math.min(0.08, elapsedSeconds);
    lastMotionFrameRef.current = now;
    let moving = false;

    const visualTargetTime =
      propsRef.current.smoothScrolling === false
        ? propsRef.current.getCurrentTime()
        : propsRef.current.getVisualCurrentTime(now);
    if (Number.isFinite(visualTargetTime)) {
      const cur = renderTimeRef.current;
      if (cur !== visualTargetTime) {
        renderTimeRef.current = visualTargetTime;
        moving = true;
      }
      if (
        propsRef.current.smoothScrolling !== false &&
        propsRef.current.isVisualSeekActive(now)
      ) {
        moving = true;
      }
    }

    const targetScale = propsRef.current.playfieldScale || 1;
    const curScale = smoothScaleRef.current;
    if (Math.abs(targetScale - curScale) < 0.002) {
      if (curScale !== targetScale) moving = true;
      smoothScaleRef.current = targetScale;
    } else {
      smoothScaleRef.current =
        curScale +
        (targetScale - curScale) * (1 - Math.exp(-SCROLL_SPEED_EASE * dt));
      moving = true;
    }

    const targetBlend = propsRef.current.svPreview ? 1 : 0;
    const curBlend = svBlendRef.current;
    if (Math.abs(targetBlend - curBlend) < 0.005) {
      if (curBlend !== targetBlend) moving = true;
      svBlendRef.current = targetBlend;
    } else {
      svBlendRef.current =
        curBlend +
        (targetBlend - curBlend) * (1 - Math.exp(-SCROLL_SPEED_EASE * dt));
      moving = true;
    }
    if (svBlendRef.current > 0) {
      svAnchorPosRef.current = svPositionAt(
        svMap(),
        renderTimeRef.current,
        svBlendRef.current,
      );
    }

    const par = parallaxRef.current;
    const dx = par.tx - par.x;
    const dy = par.ty - par.y;
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
      if (par.x !== par.tx || par.y !== par.ty) moving = true;
      par.x = par.tx;
      par.y = par.ty;
    } else {
      const parAmount = 1 - Math.exp(-PARALLAX_EASE * dt);
      par.x += dx * parAmount;
      par.y += dy * parAmount;
      moving = true;
    }

    const target = propsRef.current.view.scrollSpeed;
    const current = smoothScrollSpeedRef.current;
    if (!Number.isFinite(target)) return moving;
    if (Math.abs(target - current) < 0.01) {
      if (current !== target) moving = true;
      smoothScrollSpeedRef.current = target;
      return moving;
    }
    const amount = 1 - Math.exp(-SCROLL_SPEED_EASE * dt);
    smoothScrollSpeedRef.current = current + (target - current) * amount;
    return true;
  }, [svMap]);

  const ppms = useCallback(() => {
    const scrollSpeed = smoothScrollSpeedRef.current;
    const visibleHeight = Math.max(1, sizeRef.current.height - PLAYHEAD_FROM_BOTTOM);
    return (visibleHeight * scrollSpeed) / MANIA_MAX_TIME_RANGE;
  }, []);

  const playheadY = useCallback(() => {
    const p = propsRef.current;
    const fromEdge =
      PLAYHEAD_FROM_BOTTOM + (p.playtestMode ? p.hitPosition ?? 0 : 0);
    return p.upscroll ? fromEdge : sizeRef.current.height - fromEdge;
  }, []);

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

  const selectionScreenRect = useCallback(
    (selection: SelectionDragState): CanvasRect =>
      normalizeRect(
        selection.startX,
        timeToY(selection.startTime),
        selection.currentX,
        timeToY(selection.currentTime),
      ),
    [timeToY],
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

  const laneColourScheme = props.laneColourScheme ?? "default";
  const laneColor = useCallback(
    (col: number) =>
      defaultLaneColour(col, propsRef.current.keyCount, laneColourScheme),
    [laneColourScheme],
  );

  const noteColor = useCallback(
    (col: number) => skinColsRef.current[col]?.colour ?? laneColor(col),
    [laneColor],
  );

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
      const defaultNoteHeight =
        NOTE_HEIGHT * (propsRef.current.noteHeightScale || 1);
      const spriteHeight = (img: HTMLImageElement | null | undefined) =>
        img && img.width > 0
          ? (laneWidth - 6) * (img.height / img.width)
          : defaultNoteHeight;

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

  const overlayBuffer = props.waveformOverlay?.buffer ?? null;
  const [overlayPeaks, setOverlayPeaks] = useState<Awaited<
    ReturnType<typeof computeWaveformOverlay>
  >>(null);
  useEffect(() => {
    setOverlayPeaks(null);
    if (!overlayBuffer) return;
    let cancelled = false;
    void computeWaveformOverlay(
      overlayBuffer.getChannelData(0),
      overlayBuffer.sampleRate,
      { shouldCancel: () => cancelled },
    ).then((result) => {
      if (!cancelled) setOverlayPeaks(result);
    });
    return () => {
      cancelled = true;
    };
  }, [overlayBuffer]);
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

  const firstPointFrom = useCallback((list: TimingPoint[], t: number) => {
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].time < t) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let ctx = ctxRef.current;
    if (!ctx || ctx.canvas !== canvas) {
      ctx = canvas.getContext("2d");
      ctxRef.current = ctx;
    }
    if (!ctx) return;

    const { width, height, dpr } = sizeRef.current;

    const bw = Math.floor(width * dpr);
    const bh = Math.floor(height * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;

    const { notes, timingPoints, previewTime, view, keyCount, snapColours } =
      propsRef.current;
    const { laneWidth, playfieldWidth, originX } = laneGeometry();
    const phY = playheadY();
    const up = propsRef.current.upscroll === true;
    const boundsRef = propsRef.current.playfieldBoundsRef;
    if (boundsRef) {
      boundsRef.current = { left: originX, width: playfieldWidth, hitY: phY, height };
    }

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
      // The note field may glide through an explicit seek, but decoding every
      // intermediate video timestamp would turn that polish into a seek storm.
      // Move the video straight to the accepted destination instead.
      const videoMapTime = propsRef.current.getCurrentTime();
      const targetSec =
        ((videoMapTime - (propsRef.current.videoOffsetMs ?? 0)) * scale) / 1000;
      const rate = (propsRef.current.playbackRate ?? 1) * scale;
      if (video.playbackRate !== rate) video.playbackRate = rate;
      const inRange =
        targetSec >= 0 &&
        (!Number.isFinite(video.duration) || targetSec < video.duration);
      const seekVideoToLatest = (tolerance: number) => {
        const requested = videoSeekTargetRef.current;
        if (
          Math.abs(video.currentTime - targetSec) <= tolerance ||
          (requested !== null && Math.abs(requested - targetSec) <= tolerance)
        ) {
          return;
        }
        try {
          video.currentTime = targetSec;
          videoSeekTargetRef.current = targetSec;
        } catch {
        }
      };
      if (propsRef.current.isPlaying && inRange) {
        if (video.paused) {
          seekVideoToLatest(0.05);
          void video.play().catch(() => {});
        } else {
          seekVideoToLatest(0.2);
        }
      } else {
        if (!video.paused) video.pause();
        if (inRange) seekVideoToLatest(0.05);
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
      const par = parallaxRef.current;
      // A blur pulls the edges inward, so the picture is drawn with the radius
      // added to the parallax overscan; without it the corners fade to nothing.
      // The filter is cleared again before the dim overlay so only the picture
      // is softened, never the dim or anything drawn after it.
      const blur = Math.max(0, propsRef.current.backgroundBlur ?? 0);
      const spread = PARALLAX_PX + blur * 2;
      if (blur > 0) ctx.filter = `blur(${blur}px)`;
      drawCover(
        ctx,
        bg,
        par.x - spread,
        par.y - spread,
        width + spread * 2,
        height + spread * 2,
      );
      if (blur > 0) ctx.filter = "none";
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

    const flash = propsRef.current.laneFlash;
    if (flash && flash.column >= 0 && flash.column < keyCount) {
      const strength = laneFlashStrength(performance.now() - flash.at, reduceMotion());
      if (strength > 0) {
        const x = originX + flash.column * laneWidth;
        ctx.save();
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = 0.36 * strength;
        ctx.fillRect(x, 0, laneWidth, height);
        ctx.globalAlpha = 0.9 * strength;
        ctx.fillRect(x, 0, 2, height);
        ctx.fillRect(x + laneWidth - 2, 0, 2, height);
        ctx.restore();
      }
    }

    const overlay = overlayPeaksRef.current;
    if (overlay) {
      const half = playfieldWidth / 2;
      const cx = originX + half;
      const pad = 4;
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
        // 0% transparency is a strong 0.6 alpha; the 75% default is ~0.15.
        const clear =
          Math.max(0, Math.min(100, propsRef.current.waveformTransparency ?? 75)) / 100;
        ctx.fillStyle = `rgba(125,211,252,${(0.6 * (1 - clear)).toFixed(3)})`;
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

    if (!propsRef.current.playtestMode) {
      const drawBoundary = (
        time: number,
        outsideLater: boolean,
        rgb: string,
        label: string,
        limit?: number,
      ) => {
        const y = timeToY(time);
        const dir = up ? -1 : 1;
        const sign = outsideLater ? -dir : dir;
        const far =
          limit === undefined ? (sign > 0 ? height : 0) : timeToY(limit);
        const bandTop = Math.max(0, Math.min(y, far));
        const bandBottom = Math.min(height, Math.max(y, far));
        const bandH = bandBottom - bandTop;
        if (bandH > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(originX, bandTop, playfieldWidth, bandH);
          ctx.clip();
          ctx.fillStyle = `rgba(${rgb},${BOUND_TINT_ALPHA})`;
          ctx.fillRect(originX, bandTop, playfieldWidth, bandH);
          ctx.strokeStyle = `rgba(${rgb},${BOUND_HATCH_ALPHA})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let x = 0; x <= playfieldWidth + bandH; x += BOUND_HATCH_STEP) {
            ctx.moveTo(originX - bandH + x, bandBottom);
            ctx.lineTo(originX + x, bandTop);
          }
          ctx.stroke();
          ctx.restore();
        }
        if (y < -4 || y > height + 4) return;
        const x0 = originX;
        const x1 = originX + playfieldWidth;
        ctx.strokeStyle = `rgba(${rgb},0.26)`;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.strokeStyle = `rgb(${rgb})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
        ctx.fillStyle = `rgb(${rgb})`;
        ctx.font = `11px ${CANVAS_FONT_STACK}`;
        ctx.fillText(label, 6, sign > 0 ? y + 14 : y - 6);
      };

      const songEnd = propsRef.current.songEndMs ?? 0;
      const trimStart = propsRef.current.trimStartMs;
      const trimEnd = propsRef.current.trimEndMs;
      drawBoundary(0, false, BOUND_SONG_RGB, t("editor.songStart"));
      if (songEnd > 0) {
        drawBoundary(songEnd, true, BOUND_SONG_RGB, t("editor.songEnd"));
      }
      if (trimStart !== undefined && trimStart > 0) {
        drawBoundary(trimStart, false, BOUND_TRIM_RGB, t("editor.trimStart"), 0);
      }
      if (trimEnd !== undefined && (!(songEnd > 0) || trimEnd < songEnd - 0.5)) {
        drawBoundary(
          trimEnd,
          true,
          BOUND_TRIM_RGB,
          t("editor.trimEnd"),
          songEnd > 0 ? songEnd : undefined,
        );
      }
    }

    const showTimingLines =
      !propsRef.current.playtestMode &&
      propsRef.current.showTimingLines !== false;

    if (showTimingLines) {
      const lineEdgeA = yToTime(-20);
      const lineEdgeB = yToTime(height + 20);
      const lineLo = Math.min(lineEdgeA, lineEdgeB);
      const lineHi = Math.max(lineEdgeA, lineEdgeB);

      const reds = redPoints(timingPoints);
      for (let i = firstPointFrom(reds, lineLo); i < reds.length; i++) {
        const tp = reds[i];
        if (tp.time > lineHi) break;
        const y = timeToY(tp.time);
        ctx.strokeStyle = "#ff2d6f";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.fillStyle = "#ff2d6f";
        ctx.font = `11px ${CANVAS_FONT_STACK}`;
        ctx.fillText(`${formatUiNumber(tp.bpm)} BPM`, 6, y - 4);
      }

      const greens = greenPoints(timingPoints);
      for (let i = firstPointFrom(greens, lineLo); i < greens.length; i++) {
        const tp = greens[i];
        if (tp.time > lineHi) break;
        const y = timeToY(tp.time);
        const markerRight = originX + playfieldWidth;
        const markerLeft = Math.max(originX, markerRight - 28);
        const label = `${formatUiNumber(tp.sv)}× SV`;
        ctx.strokeStyle = "#2dd4bf";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(markerLeft, y);
        ctx.lineTo(markerRight, y);
        ctx.stroke();
        ctx.font = `600 12px ${CANVAS_FONT_STACK}`;
        const labelWidth = ctx.measureText(label).width;
        const labelX =
          markerRight + labelWidth + 16 <= width
            ? markerRight + 7
            : markerLeft - labelWidth - 7;
        ctx.fillStyle = "rgba(9,18,23,0.88)";
        roundRect(ctx, labelX - 4, y - 9, labelWidth + 8, 18, 4);
        ctx.fill();
        ctx.fillStyle = "#5eead4";
        ctx.fillText(label, labelX, y + 4);
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
          ctx.fillText(t("editor.previewPoint"), 6, y - 4);
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
          ctx.fillText(t("editor.bookmark"), 6, y - 4);
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
    const defaultNoteHeight =
      NOTE_HEIGHT * (propsRef.current.noteHeightScale || 1);
    const move = moveDragRef.current;
    const resizing = dragRef.current?.resize ? dragRef.current : null;
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
      // A long note whose tail is being dragged draws at its new length.
      const note =
        resizing?.replace?.id === original.id
          ? { ...original, endTime: resizing.currentTime }
          : move && selected
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
        // A long note can be grabbed again until its tail's window, so it
        // only fades from there.
        const lastChance = (isLN ? note.endTime! : note.startTime) + missWindowMs;
        const sinceMiss = liveCurrentTime() - lastChance;
        if (sinceMiss > 0) {
          alpha = 1 - sinceMiss / NOTE_FALLTHROUGH_FADE_MS;
          if (alpha <= 0) return;
        }
        // Dropped holds grey out as they pass, as in osu!mania.
        if (isLN && propsRef.current.droppedIdsRef?.current.has(note.id)) {
          alpha *= 0.45;
        }
      }
      ctx.globalAlpha = alpha;
      const x = originX + note.column * laneWidth;
      // Snap colours draw plain notes, since a skin's sprites carry their own.
      const bySnap = snapColours && !playtest;
      const cr = bySnap ? undefined : skinCols[note.column];
      const skinColour = bySnap ? null : skinCols[note.column]?.colour ?? null;
      const noteInKiai = !bySnap && kiaiAt(note.startTime, timingPoints);
      const color = bySnap
        ? noteSnapColour(noteSnapDivisor(note.startTime, timingPoints))
        : noteInKiai && !skinColour
          ? "#5bc0ff"
          : skinColour ?? laneColor(note.column);

      if (selected) {
        const bounds = noteBounds(note, laneWidth, originX);
        if (bounds) {
          const pad = 2.5;
          const rx = bounds.x - pad;
          const ry = bounds.y - pad;
          const rw = bounds.w + pad * 2;
          const rh = bounds.h + pad * 2;
          const radius = Math.min(8, Math.max(5, rw / 6));

          ctx.save();
          ctx.fillStyle = "rgba(255,214,102,0.12)";
          roundRect(ctx, rx, ry, rw, rh, radius);
          ctx.fill();

          ctx.shadowColor = "rgba(255,201,74,0.5)";
          ctx.shadowBlur = 13;
          ctx.strokeStyle = "rgba(255,201,74,0.32)";
          ctx.lineWidth = 3;
          roundRect(ctx, rx, ry, rw, rh, radius);
          ctx.stroke();

          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(255,231,163,0.92)";
          ctx.lineWidth = 1.25;
          roundRect(ctx, rx, ry, rw, rh, radius);
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
            : defaultNoteHeight;
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
              ? "rgba(91,192,255,0.68)"
              : "rgba(154,160,173,0.68)";
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
              ctx.fillStyle = bySnap
                ? noteSnapColour(noteSnapDivisor(note.endTime, timingPoints))
                : kiaiDefault
                  ? "#5bc0ff"
                  : "#9aa0ad";
              roundRect(ctx, x + 3, up ? yEnd : yEnd - defaultNoteHeight, laneWidth - 6, defaultNoteHeight, 4);
              ctx.fill();
            }
          }
        }
        if (headSprite) {
          drawSprite(ctx, headSprite, x, headY, laneWidth, up);
        } else {
          ctx.fillStyle = color;
          roundRect(ctx, x + 3, up ? headY : headY - defaultNoteHeight, laneWidth - 6, defaultNoteHeight, 4);
          ctx.fill();
          if (hitsoundModeRef.current) {
            drawHitsoundLetters(
              ctx,
              note.hitSound,
              x + laneWidth / 2,
              up
                ? headY + defaultNoteHeight / 2
                : headY - defaultNoteHeight / 2,
            );
          }
        }
      } else {
        const y = timeToY(note.startTime);
        if (cr?.note) {
          drawSprite(ctx, cr.note, x, y, laneWidth, up);
        } else {
          ctx.fillStyle = color;
          roundRect(ctx, x + 3, up ? y : y - defaultNoteHeight, laneWidth - 6, defaultNoteHeight, 4);
          ctx.fill();
          if (hitsoundModeRef.current) {
            drawHitsoundLetters(
              ctx,
              note.hitSound,
              x + laneWidth / 2,
              up ? y + defaultNoteHeight / 2 : y - defaultNoteHeight / 2,
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
    if (clipAtLine) ctx.restore();

    const clipPreview = clipDropPreviewRef.current;
    if (clipPreview && !propsRef.current.readOnly && !playtest) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      for (const note of clipPreview.result.candidates) {
        const bounds = noteBounds(note, laneWidth, originX);
        if (!bounds || bounds.y > height || bounds.y + bounds.h < 0) continue;
        const accepted = clipPreview.acceptedIds.has(note.id);
        ctx.fillStyle = accepted ? "rgba(45,212,191,0.3)" : "rgba(248,113,113,0.3)";
        ctx.strokeStyle = accepted ? "#2dd4bf" : "#f87171";
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
        ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
      }
      ctx.restore();
    }

    if (!propsRef.current.playtestMode && !propsRef.current.readOnly) {
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.fillStyle = "rgba(94,234,212,0.16)";
      ctx.strokeStyle = "rgba(94,234,212,0.6)";
      ctx.lineWidth = 1;
      for (const note of reviewRef.current.ghosts) {
        const bounds = noteBounds(note, laneWidth, originX);
        if (!bounds || bounds.y + bounds.h < 0 || bounds.y > height) continue;
        const x = originX + note.column * laneWidth + 4;
        ctx.fillRect(x, bounds.y, laneWidth - 8, bounds.h);
        ctx.strokeRect(x, bounds.y, laneWidth - 8, bounds.h);
      }
      ctx.restore();
    }
    const drag = dragRef.current;
    if (drag && !drag.resize) {
      const x = originX + drag.column * laneWidth;
      const yStart = timeToY(drag.startTime);
      const yEnd = timeToY(drag.currentTime);
      const top = Math.min(yStart, yEnd);
      const bottom = Math.max(yStart, yEnd);
      const previewW = (laneWidth - 8) * (propsRef.current.longNoteBodyScale || 1);
      ctx.fillStyle = "rgba(154,160,173,0.48)";
      roundRect(ctx, x + laneWidth / 2 - previewW / 2, top, previewW, Math.max(bottom - top, 2), 5);
      ctx.fill();
    }

    if (
      mouseRef.current.inside &&
      !propsRef.current.readOnly &&
      !propsRef.current.playtestMode &&
      !draggedClipRef.current &&
      !moveDragRef.current &&
      !selectionDragRef.current &&
      !shiftActiveRef.current &&
      interactionModeRef.current === "edit"
    ) {
      const col = columnAtX(mouseRef.current.x);
      if (col >= 0) {
        const my = mouseRef.current.y;
        const hover = reviewRef.current.ghosts.find((n) => {
          if (n.column !== col) return false;
          const b = noteBounds(n, laneWidth, originX);
          return !!b && my >= b.y && my <= b.y + b.h;
        });
        const t = hover ? hover.startTime : yToTime(my);
        const x = hover ? originX + col * laneWidth : mouseRef.current.x - laneWidth / 2;
        const y = timeToY(t);
        const ghost = skinCols[col]?.note ?? null;
        if (ghost) {
          drawSprite(ctx, ghost, x, y, laneWidth, up);
        } else {
          ctx.fillStyle = noteColor(col);
          roundRect(ctx, x + 3, up ? y : y - defaultNoteHeight, laneWidth - 6, defaultNoteHeight, 4);
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
      ctx.fillText(t("editor.kiai"), x + 16, phY);
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
    firstNoteFrom,
    firstPointFrom,
    laneColor,
    laneGeometry,
    liveCurrentTime,
    noteColor,
    noteBounds,
    playheadY,
    ppms,
    selectionScreenRect,
    timeToY,
    yToTime,
  ]);

  useEffect(() => {
    let raf = 0;
    let stopped = false;
    const animating = () => {
      const p = propsRef.current;
      if (p.isPlaying) return true;
      if (p.laneFlash && performance.now() - p.laneFlash.at < LANE_FLASH_MS) return true;
      const video = videoRef.current;
      if (video && !video.paused && video.readyState >= 2) return true;
      const fadeStart = bgFadeStartRef.current;
      return (
        fadeStart > 0 &&
        performance.now() - fadeStart <
          BACKGROUND_FADE_DELAY_MS + BACKGROUND_FADE_MS
      );
    };
    const schedule = () => {
      if (!stopped && !raf) raf = requestAnimationFrame(loop);
    };
    const loop = (frameNow: number) => {
      raf = 0;
      const moving = updateSmoothMotion(frameNow);
      const hud = fpsHudRef.current;
      const animated = animating();
      if (dirtyRef.current || moving || hud.show || animated) {
        dirtyRef.current = false;
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
      }
      if (moving || hud.show || animated || dirtyRef.current) schedule();
    };
    scheduleFrameRef.current = schedule;
    schedule();
    return () => {
      stopped = true;
      scheduleFrameRef.current = () => {};
      cancelAnimationFrame(raf);
    };
  }, [draw, updateSmoothMotion]);

  useEffect(markDirty);

  const revealGhostsRef = useRef(false);
  useEffect(() => {
    revealGhostsRef.current = !!props.ghostNotes;
  }, [props.ghostNotes]);
  useEffect(() => {
    const ghosts = review.ghosts;
    if (!revealGhostsRef.current || !ghosts.length) return;
    revealGhostsRef.current = false;
    const p = propsRef.current;
    if (p.isPlaying) return;
    const a = yToTime(0);
    const b = yToTime(sizeRef.current.height);
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (ghosts.some((n) => n.startTime >= lo && n.startTime <= hi)) return;
    const now = p.getCurrentTime();
    const next = ghosts.find((n) => n.startTime >= now) ?? ghosts[0];
    p.onSeek(next.startTime);
  }, [review.ghosts, yToTime]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const resize = (entries?: ResizeObserverEntry[]) => {
      // Layout dimensions stay in gameplay pixels when the HUD preview (or
      // a modal transition) scales the canvas visually.
      const rect = entries?.[0]?.contentRect;
      sizeRef.current = {
        width: rect?.width ?? wrap.clientWidth,
        height: rect?.height ?? wrap.clientHeight,
        dpr: renderScale(),
      };
      markDirty();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [markDirty, lowSpec]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    if (reduceMotion()) return;

    const clamp = (v: number) =>
      Math.max(-PARALLAX_PX, Math.min(PARALLAX_PX, v));
    const move = (e: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const par = parallaxRef.current;
      par.tx = clamp(((e.clientX - rect.left) / rect.width - 0.5) * 2 * PARALLAX_PX);
      par.ty = clamp(((e.clientY - rect.top) / rect.height - 0.5) * 2 * PARALLAX_PX);
    };
    const leave = () => {
      const par = parallaxRef.current;
      par.tx = 0;
      par.ty = 0;
    };
    wrap.addEventListener("pointermove", move, { passive: true });
    wrap.addEventListener("pointerleave", leave);
    return () => {
      wrap.removeEventListener("pointermove", move);
      wrap.removeEventListener("pointerleave", leave);
    };
  }, []);

  const localPoint = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * sizeRef.current.width / Math.max(1, rect.width),
      y: (e.clientY - rect.top) * sizeRef.current.height / Math.max(1, rect.height),
    };
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

  const findGhostAt = (x: number, y: number): ManiaNote | null => {
    const col = columnAtX(x);
    if (col < 0) return null;
    const { laneWidth, originX } = laneGeometry();
    return reviewRef.current.ghosts.find((n) => {
      if (n.column !== col) return false;
      const bounds = noteBounds(n, laneWidth, originX);
      return !!bounds && y >= bounds.y && y <= bounds.y + bounds.h;
    }) ?? null;
  };

  // The far end of a long note, which drags to lengthen or shorten it. The
  // zone takes in the tail sprite and reaches at most halfway down the body,
  // so the rest of the hold still grabs the whole note.
  const findTailAt = (x: number, y: number): ManiaNote | null => {
    const { notes, keyCount } = propsRef.current;
    const col = columnAtX(x);
    if (col < 0 || col >= keyCount) return null;
    const { laneWidth, originX } = laneGeometry();
    const up = propsRef.current.upscroll === true;
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n.column !== col || n.endTime === undefined || n.endTime <= n.startTime) {
        continue;
      }
      const bounds = noteBounds(n, laneWidth, originX);
      if (!bounds) continue;
      const yEnd = timeToY(n.endTime);
      const inward = Math.min(
        LN_TAIL_GRAB_PX,
        Math.abs(timeToY(n.startTime) - yEnd) / 2,
      );
      const outward = LN_TAIL_GRAB_PX / 2;
      const onTail = up
        ? y >= yEnd - inward && y <= Math.max(yEnd, bounds.y + bounds.h) + outward
        : y <= yEnd + inward && y >= Math.min(yEnd, bounds.y) - outward;
      if (onTail) return n;
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

  const startSelectionAutoscroll = useCallback(() => {
    if (selectionAutoscrollRafRef.current) return;
    let last = performance.now();

    const tick = (now: number) => {
      const selection = selectionDragRef.current;
      if (!selection) {
        selectionAutoscrollTimeRef.current = null;
        selectionAutoscrollRafRef.current = 0;
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
      selectionAutoscrollRafRef.current = requestAnimationFrame(tick);
    };

    selectionAutoscrollRafRef.current = requestAnimationFrame(tick);
  }, [liveCurrentTime, playheadY, ppms]);

  useEffect(
    () => () => {
      if (selectionAutoscrollRafRef.current) {
        cancelAnimationFrame(selectionAutoscrollRafRef.current);
        selectionAutoscrollRafRef.current = 0;
      }
    },
    [],
  );

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (props.playtestMode) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    focusCanvas();
    const { x, y } = localPoint(e);
    if (props.readOnly && !(e.shiftKey || shiftActiveRef.current)) return;
    const hit = findNoteAt(x, y);
    if (
      e.shiftKey ||
      shiftActiveRef.current ||
      (interactionModeRef.current === "select" && !hit)
    ) {
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
      startSelectionAutoscroll();
      setSelection(new Set());
      return;
    }

    // Grabbing a long note's tail resizes it, in either mode.
    const tail = e.ctrlKey || e.metaKey ? null : findTailAt(x, y);
    if (tail) {
      dragRef.current = {
        column: tail.column,
        startTime: tail.startTime,
        currentTime: tail.endTime ?? tail.startTime,
        replace: tail,
        resize: true,
      };
      setTailHover(true);
      return;
    }

    if (hit) {
      if (
        interactionModeRef.current === "edit" &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        if (selectedNoteIdsRef.current.size) setSelection(new Set());
        const { timingPoints, view } = propsRef.current;
        const t = snapTime(hit.startTime, timingPoints, view.snapDivisor);
        dragRef.current = {
          column: hit.column,
          startTime: t,
          currentTime: t,
          replace: hit,
        };
        return;
      }
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
    const ghost = findGhostAt(x, y);
    if (ghost?.endTime !== undefined) {
      propsRef.current.onAddNotes([{ id: uid("n"), column: ghost.column, startTime: ghost.startTime, endTime: ghost.endTime }]);
      return;
    }
    if (ghost) {
      dragRef.current = { column: ghost.column, startTime: ghost.startTime, currentTime: ghost.startTime };
      return;
    }
    const col = columnAtX(x);
    if (col < 0) return;
    const { timingPoints, view } = propsRef.current;
    const t = snapTime(yToTime(y), timingPoints, view.snapDivisor);
    if (!inBounds(t)) return;
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
      const { lo, hi } = playableBounds(propsRef.current);
      const snapped = snapTime(yToTime(y), timingPoints, view.snapDivisor);
      drag.currentTime = Math.min(Math.max(snapped, lo), hi);
      if (drag.resize) {
        // Shortening stops a snap past the head, so the hold stays a hold.
        const shortest = stepToSnap(drag.startTime, timingPoints, view.snapDivisor, 1);
        drag.currentTime = Math.max(drag.currentTime, shortest);
      }
      return;
    }
    setTailHover(!propsRef.current.readOnly && !!findTailAt(x, y));
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
        const escapes = updated.some((n, i) => {
          const from = move.origin[i];
          return (
            !inBounds(n.startTime, n.endTime ?? n.startTime) &&
            inBounds(from.startTime, from.endTime ?? from.startTime)
          );
        });
        const byId = new Map(updated.map((n) => [n.id, n]));
        const nextNotes = propsRef.current.notes.map((n) => byId.get(n.id) ?? n);
        if (!escapes && !hasNoteCollisions(nextNotes)) {
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

    if (drag.resize && drag.replace) {
      const original = drag.replace;
      if (drag.currentTime === original.endTime) return;
      const resized: ManiaNote = { ...original, endTime: drag.currentTime };
      const escapes =
        !inBounds(resized.startTime, drag.currentTime) &&
        inBounds(original.startTime, original.endTime);
      const others = propsRef.current.notes.filter((n) => n.id !== original.id);
      if (escapes || !withoutNoteCollisions([resized], others).length) return;
      propsRef.current.onMoveNotes([resized]);
      return;
    }

    const start = Math.min(drag.startTime, drag.currentTime);
    const end = Math.max(drag.startTime, drag.currentTime);
    const id = drag.replace?.id ?? uid("n");
    const hs: Partial<ManiaNote> = drag.replace ? hitsoundOf(drag.replace) : {};
    if (!drag.replace && propsRef.current.currentHitSound)
      hs.hitSound = propsRef.current.currentHitSound;
    if (!drag.replace && propsRef.current.currentSampleSet)
      hs.sampleSet = propsRef.current.currentSampleSet;

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
    if (!inBounds(start, end)) return;
    const existing = drag.replace
      ? propsRef.current.notes.filter((candidate) => candidate.id !== drag.replace?.id)
      : propsRef.current.notes;
    if (!withoutNoteCollisions([note], existing).length) return;
    if (drag.replace) propsRef.current.onMoveNotes([note]);
    else props.onPlaceNote(note);
  };

  const onMouseLeave = () => {
    mouseRef.current.inside = false;
    setTailHover(false);
    dragRef.current = null;
    moveDragRef.current = null;
    if (!boxSelectCapturedRef.current) {
      selectionDragRef.current = null;
      selectionAutoscrollTimeRef.current = null;
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (props.playtestMode || props.readOnly) return;
    const { x, y } = localPoint(e);
    const note = findNoteAt(x, y);
    if (!note) {
      const ghost = findGhostAt(x, y);
      if (ghost) reviewRef.current.dismiss(ghost.id);
      return;
    }

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
    markDirty();
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
    markDirty();
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
      scheduleInteractiveSeek(scrub.time, "scrub");
      return;
    }
    onMouseMove(e);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    markDirty();
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
      if (pts.size < 2) {
        flushInteractiveSeek();
        scrubRef.current = null;
      }
      return;
    }
    onMouseUp(e);
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    markDirty();
    if (e.pointerType === "mouse") {
      if (boxSelectCapturedRef.current) {
        boxSelectCapturedRef.current = false;
        selectionDragRef.current = null;
        selectionAutoscrollTimeRef.current = null;
      }
      return;
    }
    activePointersRef.current.delete(e.pointerId);
    if (scrubRef.current) flushInteractiveSeek();
    scrubRef.current = null;
    if (activePointersRef.current.size === 0) onMouseLeave();
  };

  const onPointerLeave = (e: React.PointerEvent) => {
    markDirty();
    if (e.pointerType === "mouse") onMouseLeave();
  };

  const onWheel = (e: React.WheelEvent) => {
    if (props.playtestMode) {
      e.preventDefault();
      return;
    }
    if (e.altKey) {
      e.preventDefault();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const { view } = propsRef.current;
      const currentIndex = SNAP_OPTIONS.indexOf(view.snapDivisor);
      const dir = e.deltaY > 0 ? -1 : 1;
      const nextIndex = Math.min(
        SNAP_OPTIONS.length - 1,
        Math.max(0, currentIndex + dir),
      );
      if (nextIndex !== currentIndex) {
        propsRef.current.onView({
          ...view,
          snapDivisor: SNAP_OPTIONS[nextIndex],
        });
      }
      return;
    }

    const { timingPoints, view } = propsRef.current;
    const currentTime =
      pendingInteractiveSeekRef.current?.time ??
      propsRef.current.getCurrentTime();
    const dir: 1 | -1 = e.deltaY < 0 ? -1 : 1;
    const firstStep = stepToSnap(currentTime, timingPoints, view.snapDivisor, dir);
    // While playing, playback keeps advancing between reading the time and the
    // seek landing, so a single snap step gets overtaken and scrolling feels
    // stuck. Step an extra snap in the scroll direction to compensate - for both
    // directions, so forward and backward scrolling both work during playback.
    const target = propsRef.current.isPlaying
      ? stepToSnap(firstStep, timingPoints, view.snapDivisor, dir)
      : firstStep;
    scheduleInteractiveSeek(target, "smooth");
  };

  const onClipDragStart = (e: React.DragEvent<HTMLElement>, clip: Clip) => {
    if (propsRef.current.readOnly || propsRef.current.playtestMode || !clip.notes.length) {
      e.preventDefault();
      return;
    }
    if (!positionPatternForDrop(clip.notes, 0, propsRef.current.keyCount)) {
      e.preventDefault();
      setClipboardStatus(t("editor.patternTooWide"));
      return;
    }
    e.stopPropagation();
    e.dataTransfer.setData(NOTE_CLIP_DRAG_TYPE, clip.id);
    e.dataTransfer.effectAllowed = "copy";
    // The playfield draws its own drop preview, so skip the browser's ghost.
    if (EMPTY_DRAG_IMAGE) e.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0);
    draggedClipRef.current = clip;
    clipDropPreviewRef.current = null;
    dragRef.current = null;
    moveDragRef.current = null;
    selectionDragRef.current = null;
    mouseRef.current.inside = false;
    setClipboardStatus(t("editor.dropHint"));
    markDirty();
  };

  const clipDropAt = (x: number, y: number): ClipDropPreview | null => {
    const clip = draggedClipRef.current;
    const p = propsRef.current;
    const column = columnAtX(x);
    if (!clip || p.readOnly || p.playtestMode || column < 0 || y < 0 || y > sizeRef.current.height) {
      return null;
    }
    const base = snapTime(yToTime(y), p.timingPoints, p.view.snapDivisor);
    const { lo, hi } = playableBounds(p);
    const cached = clipDropPreviewRef.current;
    if (
      cached && cached.clip === clip && cached.column === column &&
      cached.base === base && cached.notes === p.notes &&
      cached.timingPoints === p.timingPoints && cached.keyCount === p.keyCount &&
      cached.snapDivisor === p.view.snapDivisor && cached.lo === lo && cached.hi === hi
    ) return cached;
    const pattern = positionPatternForDrop(clip.notes, column, p.keyCount);
    if (!pattern) return null;
    const result = prepareNotePaste(
      pattern, base, p.keyCount, p.timingPoints, p.view.snapDivisor, p.notes, { lo, hi },
    );
    return {
      clip, column, base, notes: p.notes, timingPoints: p.timingPoints,
      keyCount: p.keyCount, snapDivisor: p.view.snapDivisor, lo, hi, result,
      acceptedIds: new Set(result.notes.map((n) => n.id)),
    };
  };

  const onClipDragOver = (e: React.DragEvent<HTMLCanvasElement>) => {
    if (!e.dataTransfer.types.includes(NOTE_CLIP_DRAG_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    const { x, y } = localPoint(e);
    const preview = clipDropAt(x, y);
    e.dataTransfer.dropEffect = preview?.result.notes.length ? "copy" : "none";
    if (preview !== clipDropPreviewRef.current) {
      clipDropPreviewRef.current = preview;
      markDirty();
    }
  };

  const onClipDragLeave = (e: React.DragEvent<HTMLCanvasElement>) => {
    if (!e.dataTransfer.types.includes(NOTE_CLIP_DRAG_TYPE)) return;
    e.stopPropagation();
    clipDropPreviewRef.current = null;
    markDirty();
  };

  const onClipDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    if (!e.dataTransfer.types.includes(NOTE_CLIP_DRAG_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    const clip = draggedClipRef.current;
    if (!clip || e.dataTransfer.getData(NOTE_CLIP_DRAG_TYPE) !== clip.id) {
      clearClipDrag();
      return;
    }
    const { x, y } = localPoint(e);
    const preview = clipDropAt(x, y);
    clearClipDrag();
    if (!preview) return;
    setClipboardStatus(preview.result.message);
    if (!preview.result.notes.length) return;
    selectClip(clip.id);
    propsRef.current.onAddNotes(preview.result.notes);
    setSelection(new Set(preview.result.notes.map((n) => n.id)));
    focusCanvas();
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
        tabIndex={props.keyboardShortcuts === false ? -1 : 0}
        aria-label={t("editor.ariaLabel")}
        className={`block h-full w-full touch-none ${
          props.playtestMode
            ? "cursor-default"
            : tailHover
              ? "cursor-ns-resize"
              : interactionMode === "select"
                ? "cursor-default"
                : "cursor-crosshair"
        }`}
        onBlur={(e) => {
          delete e.currentTarget.dataset.pointerFocus;
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onWheel={onWheel}
        onDragOver={onClipDragOver}
        onDragLeave={onClipDragLeave}
        onDrop={onClipDrop}
      />
      {patternImage && <PatternImageModal info={patternImage} onClose={() => { setPatternImage(null); canvasRef.current?.focus(); }} />}
      {review.enabled && !props.playtestMode && !props.readOnly && <GhostNotesPanel review={review} hasAudio={!!props.audioBuffer} focusEditor={() => canvasRef.current?.focus()} />}
      {!props.playtestMode && clipboardStatus && (
        <div role="status" className="pointer-events-none absolute bottom-14 left-3 right-3 z-20 mx-auto w-fit max-w-md rounded-md border border-ink-600 bg-ink-900/95 px-3 py-2 text-xs text-slate-200 shadow-lg">
          {clipboardStatus}
        </div>
      )}
      {!props.hideHints && !props.playtestMode && (
        <div
          className={`pointer-events-none absolute right-3 top-3 select-none rounded-md border border-yellow-300/40 bg-yellow-500/15 px-3 py-1.5 text-xs font-medium text-yellow-100 shadow-lg transition-[opacity,transform] duration-150 ${
            shiftActive
              ? "translate-y-0 opacity-100"
              : "-translate-y-2 opacity-0"
          }`}
        >
          {t("editor.multiSelect")}
        </div>
      )}

      {!props.playtestMode && (
        <div className="absolute left-3 top-12 z-20 flex select-none rounded-lg border border-white/10 bg-ink-800/90 p-1 text-[11px] shadow-lg backdrop-blur">
          {(["edit", "select"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setInteractionMode(mode)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize transition ${
                interactionMode === mode
                  ? "bg-accent/25 text-accent"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
              }`}
              title={
                mode === "edit"
                  ? t("editor.editModeTitle")
                  : t("editor.selectModeTitle")
              }
            >
              {mode === "edit" ? t("editor.editMode") : t("editor.selectMode")}
            </button>
          ))}
          <span className="self-center px-1 text-[9px] text-slate-600">Q</span>
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
          {receptorsOn ? t("editor.receptorsOn") : t("editor.receptorsOff")}
        </div>
      )}

      {selectionCount > 0 && !props.playtestMode && (
        <div className="absolute left-1/2 top-3 z-20 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 select-none flex-wrap items-center justify-center gap-1 rounded-lg border border-yellow-300/30 bg-ink-800/92 p-1 text-[11px] text-slate-200 shadow-xl backdrop-blur">
          <span className="font-medium text-yellow-200">
            {t("editor.selected", { count: selectionCount })}
          </span>
          <span className="mx-0.5 h-4 w-px bg-white/10" />
          <SelectionActionButton
            label={t("common.copy")}
            title={t("editor.copySelection")}
            onClick={copySelection}
          />
          <SelectionActionButton label={t("editor.image")} title={t("editor.copyImage")} onClick={openPatternImage} />
          <SelectionActionButton
            label="←"
            title={t("editor.moveLeft")}
            onClick={() => nudgeSelection("left")}
          />
          <SelectionActionButton
            label="−t"
            title={t("editor.moveEarlier")}
            onClick={() => nudgeSelection("earlier")}
          />
          <SelectionActionButton
            label="+t"
            title={t("editor.moveLater")}
            onClick={() => nudgeSelection("later")}
          />
          <SelectionActionButton
            label="→"
            title={t("editor.moveRight")}
            onClick={() => nudgeSelection("right")}
          />
          <SelectionActionButton
            label={t("editor.mirror")}
            title={t("editor.mirrorTitle")}
            onClick={mirrorSelection}
          />
          <SelectionActionButton
            label={t("editor.reverse")}
            title={t("editor.reverseTitle")}
            onClick={reverseSelection}
          />
          <SelectionActionButton
            label={t("editor.shuffle")}
            title={t("editor.shuffleTitle")}
            onClick={shuffleSelection}
          />
          <SelectionActionButton
            label="½"
            title={t("editor.halveTitle")}
            onClick={() => scaleSelection(0.5)}
          />
          <SelectionActionButton
            label="2×"
            title={t("editor.doubleTitle")}
            onClick={() => scaleSelection(2)}
          />
          <SelectionActionButton
            label={t("common.delete")}
            title={t("editor.deleteTitle")}
            danger
            onClick={deleteSelection}
          />
        </div>
      )}

      {!props.playtestMode && !props.hideClipboard && (clipboard || history.length > 0) && (
        <div className="absolute right-3 top-14 w-44 select-none rounded-lg border border-ink-600 bg-ink-800/90 p-2 text-xs text-slate-300 shadow-xl backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-medium text-slate-200">{t("editor.clipboard")}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  clearClipboard();
                  setClipboardStatus("");
                }}
                className="rounded px-1 py-0.5 text-[10px] text-slate-500 transition hover:bg-ink-600 hover:text-slate-200"
                title={t("editor.clearClipboardTitle")}
              >
                {t("editor.clear")}
              </button>
              <span className="text-[10px] text-slate-500">Ctrl+V</span>
            </div>
          </div>
          {clipboard?.kind === "difficulty" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-start gap-2 rounded-md border border-yellow-300/40 bg-yellow-500/5 p-1.5">
                <DifficultyClipLabel clip={clipboard} detailed />
              </div>
              <button
                type="button"
                onClick={paste}
                disabled={props.readOnly || !props.onPasteDifficulty}
                className="rounded-md border border-ink-600 bg-ink-700/60 px-2 py-1 text-[10px] font-medium text-slate-200 transition hover:bg-ink-600 disabled:opacity-40"
                title={t("editor.addDifficultyTitle")}
              >
                {t("editor.addToMap")}
              </button>
            </div>
          ) : clipboard ? (
            <div className="flex flex-col gap-1.5">
              <div
                draggable={!props.readOnly}
                onDragStart={(e) => onClipDragStart(e, clipboard)}
                onDragEnd={clearClipDrag}
                title={t("editor.dragClipTitle")}
                className={`flex items-center gap-2 rounded-md border border-yellow-300/40 bg-yellow-500/5 p-1.5 ${props.readOnly ? "" : "cursor-grab active:cursor-grabbing"}`}
              >
                <ClipThumb clip={clipboard} keyCount={props.keyCount} />
                <span className="min-w-0 text-[10px] text-slate-400">
                  {t("editor.noteCount", { count: clipboard.notes.length })}
                </span>
                <SnapBadge pattern={clipboard.notes} />
              </div>
              {!props.readOnly && (
                <span className="text-center text-[10px] text-slate-400">{t("editor.dragOntoPlayfield")}</span>
              )}
              <button
                type="button"
                onClick={paste}
                disabled={props.readOnly}
                className="rounded-md border border-ink-600 bg-ink-700/60 px-2 py-1 text-[10px] font-medium text-slate-200 transition hover:bg-ink-600 disabled:opacity-40"
                title={t("editor.pasteAtPlayheadTitle")}
              >
                {t("editor.pasteAtPlayhead")}
              </button>
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
                  title={t("editor.saveAsPresetTitle")}
                >
                  {t("editor.saveAsPreset")}
                </button>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">{t("editor.nothingCopied")}</p>
          )}

          {history.length > 1 && (
            <>
              <div className="mb-1 mt-2.5 text-[10px] uppercase tracking-wide text-slate-500">
                {t("editor.pasteboard")}
              </div>
              <div className="flex flex-col gap-1">
                {history.map((item) => (
                  <button
                    key={item.id}
                    draggable={!props.readOnly && item.kind === "notes"}
                    onDragStart={(e) => {
                      if (item.kind === "notes") onClipDragStart(e, item);
                      else e.preventDefault();
                    }}
                    onDragEnd={clearClipDrag}
                    title={
                      item.kind === "notes"
                        ? t("editor.selectPatternTitle")
                        : t("editor.selectDifficultyTitle")
                    }
                    onClick={() => {
                      selectClip(item.id);
                      setClipboardStatus(
                        item.kind === "notes"
                          ? t("editor.notesReady", { count: item.notes.length })
                          : t("editor.difficultyReady", { name: item.difficulty.name || t("editor.difficulty") }),
                      );
                    }}
                    className={`flex min-h-[30px] items-center gap-2 rounded-md border px-1.5 py-1 text-left transition ${
                      item.id === clipboard?.id
                        ? "border-yellow-300/50 bg-yellow-500/10"
                        : "border-ink-600 bg-ink-700/40 hover:border-slate-500"
                    }`}
                  >
                    {item.kind === "notes" ? (
                      <>
                        <ClipThumb clip={item} keyCount={props.keyCount} small />
                        <span className="min-w-0 flex-1 text-[10px] text-slate-400">
                          {t("editor.noteCount", { count: item.notes.length })}
                        </span>
                        <SnapBadge pattern={item.notes} />
                      </>
                    ) : (
                      <DifficultyClipLabel clip={item} />
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {hitsoundBarMounted && !props.zenMode && (
        <div
          className={`absolute bottom-3 left-1/2 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center whitespace-nowrap gap-2 rounded-lg border border-ink-600 bg-ink-800/90 px-2.5 py-1.5 text-xs text-slate-200 shadow-xl backdrop-blur ${
            hitsoundBarClosing ? "hitsound-bar-out" : "hitsound-bar-in"
          }`}
        >
          <span className="font-medium text-slate-300">{t("hitsoundBar.title")}</span>
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
                  s === 0
                    ? t("hitsoundBar.autoTitle")
                    : t("hitsoundBar.sampleSetTitle", { name })
                }
              >
                {s === 0 ? t("hitsoundBar.auto") : name}
              </button>
            ))}
          </div>
          <span className="text-slate-600">·</span>
          <div className="flex gap-1">
            <HitsoundAddBtn
              label="W"
              title={t("hitsoundBar.whistle")}
              active={toolbarHasAddition(HITSOUND_WHISTLE)}
              onClick={() => toggleAddition(HITSOUND_WHISTLE)}
            />
            <HitsoundAddBtn
              label="F"
              title={t("hitsoundBar.finish")}
              active={toolbarHasAddition(HITSOUND_FINISH)}
              onClick={() => toggleAddition(HITSOUND_FINISH)}
            />
            <HitsoundAddBtn
              label="C"
              title={t("hitsoundBar.clap")}
              active={toolbarHasAddition(HITSOUND_CLAP)}
              onClick={() => toggleAddition(HITSOUND_CLAP)}
            />
          </div>
          <span className="text-[10px] text-slate-500">
            {selectionCount > 0
              ? t("hitsoundBar.selected", { count: selectionCount })
              : t("hitsoundBar.newNotes")}
          </span>
          {props.onCopyHitsounds && (props.hitsoundSources?.length ?? 0) > 0 && (
            <>
              <span className="text-slate-600">·</span>
              <Menu
                label={t("hitsoundBar.copy")}
                className="!rounded !bg-ink-700 !px-2 !py-0.5 !text-xs hover:!bg-ink-600"
                items={[
                  ...(props.onCopyHitsoundsToAll
                    ? [
                        {
                          label: t("hitsoundBar.copyToAll"),
                          onClick: props.onCopyHitsoundsToAll,
                          title: t("hitsoundBar.copyToAllTitle"),
                        },
                        { separator: true as const },
                      ]
                    : []),
                  ...(props.hitsoundSources ?? []).map((s) => ({
                  label: t("hitsoundBar.copyFrom", { name: s.name, count: s.hitsoundCount }),
                  disabled: s.hitsoundCount === 0,
                  onClick: () => props.onCopyHitsounds?.(s.id),
                  title:
                    s.hitsoundCount === 0
                      ? t("hitsoundBar.noHitsounds")
                      : t("hitsoundBar.copyFromTitle", { name: s.name }),
                  })),
                ]}
              />
            </>
          )}
          <span className="text-slate-600">·</span>
          <span className="text-[10px] text-slate-500">{t("hitsoundBar.exit")}</span>
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

const ClipPreview = memo(function ClipPreview({
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
  const riceH = size === "large" ? 6 : 3;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const maxTime = clip.notes.reduce(
      (max, n) => Math.max(max, n.endTime ?? n.startTime),
      1,
    );
    const ty = (time: number) => h - pad - (time / maxTime) * (h - 2 * pad);
    for (const n of clip.notes) {
      const x = n.column * cellW + 0.5;
      const hold = n.endTime !== undefined && n.endTime > n.startTime;
      const top = hold ? ty(n.endTime!) : ty(n.startTime) - riceH / 2;
      const height = hold ? Math.max(2, ty(n.startTime) - top) : riceH;
      ctx.fillStyle = hold
        ? "rgba(232,104,104,0.85)"
        : defaultLaneColour(n.column, keyCount);
      roundRect(ctx, x, top, cellW - 1, height, 1);
      ctx.fill();
    }
  }, [clip, keyCount, cellW, w, h, pad, riceH]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ width: w, height: h }}
      className="shrink-0 rounded bg-ink-900/70"
      aria-hidden
    />
  );
});

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

/** A transparent 1×1 picture handed to setDragImage in place of the ghost.
 *  Made at load so it has decoded by the first drag. */
const EMPTY_DRAG_IMAGE =
  typeof Image === "undefined"
    ? null
    : Object.assign(new Image(1, 1), {
        src: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
      });

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

const LANE_FLASH_MS = 800;

/**
 * How lit a flashed lane is, 0 to 1: bright at once, dark, bright again a
 * little softer, then out. With reduced motion it simply fades.
 */
function laneFlashStrength(elapsed: number, reduced: boolean): number {
  if (elapsed < 0 || elapsed >= LANE_FLASH_MS) return 0;
  const p = elapsed / LANE_FLASH_MS;
  if (reduced) return 1 - p;
  return Math.cos(1.5 * Math.PI * p) ** 2 * (1 - 0.4 * p);
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
