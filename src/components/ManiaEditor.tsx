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
import type { PatternNote } from "../lib/patterns";
import type { Waveform } from "../hooks/useWaveform";
import { hasNoteCollisions, withoutNoteCollisions } from "../lib/noteCollision";
import { mirrorColumns } from "../lib/noteTools";

/**
 * Canvas-based vertical mania editor.
 *
 * Coordinate model:
 *   - A fixed "playhead" line sits near the bottom of the canvas and always
 *     represents the current audio time.
 *   - Future notes are drawn above it and scroll downward as time advances.
 *   - Scroll velocity matches osu!mania: at scroll speed S the region above
 *     the playhead shows MANIA_MAX_TIME_RANGE / S milliseconds of notes, so
 *     pixels-per-ms = visibleHeight * S / MANIA_MAX_TIME_RANGE.
 *
 * Interaction:
 *   - Left click in a lane: place a note (snapped to the beat grid).
 *   - Left click + drag vertically: place a long note (hold).
 *   - Mouse wheel: scrub through time.
 */

// osu!lazer mania MAX_TIME_RANGE: ms of notes visible above the hit line at
// scroll speed 1. The visible window shrinks to ~287ms at scroll speed 40.
const MANIA_MAX_TIME_RANGE = 11485;
const PLAYHEAD_FROM_BOTTOM = 96;
const NOTE_HEIGHT = 16;
const SELECT_AUTOSCROLL_TOP_ZONE = 64;
// Inset (px) the box-select rectangle stops short of the canvas edge, so it
// visibly halts inside the notefield instead of hugging the very border.
const SELECT_EDGE_INSET = 12;
const SELECT_AUTOSCROLL_MIN_PX_PER_SEC = 280;
const SELECT_AUTOSCROLL_MAX_PX_PER_SEC = 900;
// How close (ms) the playhead must be to a note for that column's receptor to
// light up to its pressed sprite, so notes visibly "hit" as they reach the line.
const RECEPTOR_HIT_WINDOW = 90;
// Playtest Mode: how long (ms past its hit time) a missed note keeps sliding
// below the receptors while fading to nothing, so unhit notes visibly fall
// *through* the line instead of blinking away at it.
const NOTE_FALLTHROUGH_FADE_MS = 240;

const BACKGROUND_FADE_DELAY_MS = 700;
const BACKGROUND_FADE_MS = 500;
const SCROLL_SPEED_EASE = 11;
// Exponential ease rate for smooth scrolling (≈150ms to settle on a snap line).
const SCROLL_TIME_EASE = 20;
// osu!lazer font stack for canvas text - mirrors --font-osu / tailwind `sans`.
const CANVAS_FONT_STACK =
  '"Torus", "Torus-Alternate", "Inter", ui-sans-serif, system-ui, sans-serif';

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
  /** Background video object URL (osu! Video event). Always played muted. */
  videoUrl?: string | null;
  /** Ms into the song at which the background video starts. Default 0. */
  videoOffsetMs?: number;
  /** Audio playback rate, mirrored onto the background video. Default 1. */
  playbackRate?: number;
  /** How strongly to dim the background image for note readability, 0..100. */
  dimBackground: number;
  /** Skin assets for the active keymode, or null to use the default look. */
  skin: ManiaKeymodeSkin | null;
  /** Multiplies the on-screen playfield / lane size. Default 1. */
  playfieldScale: number;
  /** Width multiplier for the default long-note body. Default 1. */
  longNoteBodyScale: number;
  /** Ease scrubbing between snap lines (still snaps) instead of jumping. */
  smoothScrolling?: boolean;
  /** Flip the playfield so notes scroll upward (upscroll). */
  upscroll?: boolean;
  /** Hide non-essential overlays (e.g. the KIAI label) in zen mode. */
  zenMode: boolean;
  onPlaceNote: (note: ManiaNote) => void;
  onDeleteNote: (id: string) => void;
  onAddNotes: (notes: ManiaNote[]) => void;
  onDeleteNotes: (ids: string[]) => void;
  onMoveNotes: (notes: ManiaNote[]) => void;
  onView: (view: ViewState) => void;
  onSeek: (ms: number) => void;
  onVolumeChange: (delta: number) => void;
  /** Additions bitmask (2/4/8) applied to newly placed notes. */
  currentHitSound: number;
  /** Normal sample set (0=auto,1,2,3) applied to newly placed notes. */
  currentSampleSet: number;
  onCurrentHitSound: (value: number) => void;
  onCurrentSampleSet: (value: number) => void;
  /** Publish the given copied pattern as a shared preset (opens a dialog). */
  onPublishPattern?: (pattern: PatternNote[], keyCount: number) => void;
  /** When set (by a changing id), load this pattern into the editor clipboard. */
  pendingClip?: { id: string; pattern: PatternNote[] } | null;
  /** View-only (collaborator viewer role): block note placement / dragging. */
  readOnly?: boolean;
  /** Gameplay preview: render only and block every editor interaction. */
  playtestMode?: boolean;
  /**
   * Playtest Mode: a live ref to the ids of long notes the player is currently
   * holding. Held LNs stay pinned to the judgement line; every other note that
   * passes the line unhit falls through it. A ref (read each frame by the canvas)
   * rather than a prop so a press reflects on the very next frame — no React
   * render delay, which would make a held LN flicker on the frame it's caught.
   * Ignored outside playtest.
   */
  heldLnIdsRef?: { readonly current: { has(id: string): boolean } };
  /**
   * Playtest Mode: a live ref to the ids of notes already consumed (hit, or a
   * long note whose hold has ended). Read each frame so a consumed note vanishes
   * immediately instead of lingering a frame until React state catches up.
   * Ignored outside playtest.
   */
  consumedIdsRef?: { readonly current: { has(id: string): boolean } };
  /**
   * Playtest Mode: synchronous set of columns whose key the player is currently
   * holding. Drives the receptor "pressed" glow from real input instead of from
   * notes passing the line. Read as a ref (not state) so the glow lights the
   * instant a key goes down, with no React-commit delay. Ignored outside
   * playtest.
   */
  pressedColumnsRef?: { readonly current: { has(column: number): boolean } };
  /**
   * Playtest Mode: "hit position" offset in pixels. Shifts the falling notes
   * down by this amount so they meet the player below the receptors, without
   * moving the receptors. Visual only (judgement stays audio-timed) and never
   * applied in the editor.
   */
  hitPositionOffset?: number;
  /**
   * Decoded song waveform to overlay on the hit lane (Playtest Mode only), or
   * null/undefined to hide it. Lets audio peaks be lined up visually with the
   * notes crossing the receptors when dialing in an offset.
   */
  waveformOverlay?: Waveform | null;
  /**
   * Playtest Mode: the miss-window (ms) for the active OD. A fallen-through note
   * stays fully opaque until it's this far past its time, then fades — so notes
   * never dim while they're still hittable. Ignored outside playtest.
   */
  missWindowMs?: number;
  /** Hide the on-canvas hint overlays (used by the read-only reference view). */
  hideHints?: boolean;
  /** Editor bookmarks (ms) to draw as lines in the playfield. */
  bookmarks?: number[];
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
  // Raw (un-clamped) pointer Y. currentY is pinned to the canvas inset for
  // drawing; rawY tracks the true cursor so edge-autoscroll speed can scale with
  // how far outside the canvas the pointer is dragged.
  rawY: number;
};

/** In-progress drag of the current selection to a new column / time. */
type MoveDragState = {
  startX: number;
  startY: number;
  /** Lane offset applied to every selected note (clamped to the playfield). */
  colDelta: number;
  /** Raw time offset (ms) applied to every selected note while dragging. */
  timeDelta: number;
  /** Becomes true once the pointer has actually moved (vs. a plain click). */
  moved: boolean;
  /** True once the selection has moved vertically enough to edit timing. */
  timeMoved: boolean;
  /** Original positions of the dragged notes, captured at mousedown. */
  origin: ({
    id: string;
    column: number;
    startTime: number;
    endTime?: number;
  } & Partial<ManiaNote>)[];
};

/**
 * A clipboard entry: notes normalized so the earliest one starts at time 0.
 * Columns stay absolute so paste lands in the same lanes.
 */
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

/** Copy the optional hitsound fields off a note (for clipboard / cloning). */
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

/** The whistle/finish/clap additions on a note as a short label, e.g. "WF". */
function hitsoundLabel(hitSound: number | undefined): string {
  if (!hitSound) return "";
  let s = "";
  if (hitSound & HITSOUND_WHISTLE) s += "W";
  if (hitSound & HITSOUND_FINISH) s += "F";
  if (hitSound & HITSOUND_CLAP) s += "C";
  return s;
}

/** Draw the hitsound letters centred in a default-skin note bar. */
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

/** Resolved render assets for one column of the active skin keymode. */
type ColumnRender = {
  colour: string | null;
  note: HTMLImageElement | null;
  head: HTMLImageElement | null;
  body: HTMLImageElement | null;
  /** Cap height (in body sprite px) for a capped body; null = stretch whole. */
  bodyCapPx: number | null;
  tail: HTMLImageElement | null;
  /** Receptor sprite (idle) drawn at the judgement line. */
  key: HTMLImageElement | null;
  /** Receptor sprite shown while the column is being hit. */
  keyDown: HTMLImageElement | null;
};

export function ManiaEditor(props: Props) {
  const [shiftActive, setShiftActive] = useState(false);
  // Receptors (the osu!mania "keys" at the judgement line). Toggled with R.
  const [receptorsOn, setReceptorsOn] = useState(true);
  const receptorsOnRef = useRef(true);
  receptorsOnRef.current = receptorsOn;
  // Hitsound mode: shows the hitsound toolbar + per-note letters and enables
  // the W/F/C editing keys. Toggled with H. Playback is unaffected by it.
  const [hitsoundMode, setHitsoundMode] = useState(false);
  const hitsoundModeRef = useRef(false);
  hitsoundModeRef.current = hitsoundMode;
  const [selectionCount, setSelectionCount] = useState(0);
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const [history, setHistory] = useState<Clip[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgFadeStartRef = useRef(0);
  // Off-DOM muted <video> for the background video; drawn straight into the
  // canvas each frame and kept in sync with the audio clock (see draw()).
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // Resolved skin sprites/colours per column. Read by the rAF draw loop.
  const skinColsRef = useRef<ColumnRender[]>([]);
  const shiftActiveRef = useRef(false);
  const selectedNoteIdsRef = useRef<Set<string>>(new Set());
  const clipboardRef = useRef<Clip | null>(null);
  clipboardRef.current = clipboard;

  // Load an externally-provided pattern (e.g. a preset chosen in the browser)
  // into the clipboard so the user can paste it where they want with Ctrl+V.
  const lastPendingClipRef = useRef<string | null>(null);
  useEffect(() => {
    const pc = props.pendingClip;
    if (!pc || pc.id === lastPendingClipRef.current) return;
    lastPendingClipRef.current = pc.id;
    const clip: Clip = { id: pc.id, notes: pc.pattern };
    setClipboard(clip);
    setHistory((prev) => [clip, ...prev].slice(0, 8));
  }, [props.pendingClip]);

  // Mutable mirror of props so the rAF draw loop always reads fresh values.
  const propsRef = useRef(props);
  propsRef.current = props;
  // The time used for rendering + interaction. With smooth scrolling on it eases
  // toward the real audio time (set each frame in updateSmoothMotion) so a scrub
  // glides between snap lines; otherwise it tracks the clock exactly.
  const renderTimeRef = useRef(props.currentTime);
  const liveCurrentTime = useCallback(() => renderTimeRef.current, []);
  const smoothScrollSpeedRef = useRef(props.view.scrollSpeed);
  // Eased playfield zoom, so +/- and the size slider animate instead of snapping.
  const smoothScaleRef = useRef(props.playfieldScale || 1);
  const lastMotionFrameRef = useRef(
    typeof performance !== "undefined" ? performance.now() : 0,
  );

  const sizeRef = useRef({ width: 800, height: 600, dpr: 1 });
  // FPS / frame-time diagnostic HUD, shown only when the page URL has ?fps.
  // `drawMs` is how long draw() itself takes (CPU cost); `fps` is the actual
  // rate the rAF loop is being serviced at (i.e. what Chrome is presenting).
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
  // True while a *mouse* box-select holds pointer capture, so the drag keeps
  // tracking (and doesn't get cancelled) when the cursor leaves the canvas.
  const boxSelectCapturedRef = useRef(false);
  // Touch input: every active touch/pen pointer by id (client coords), plus the
  // two-finger scrub state (the touch replacement for the mouse wheel).
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(
    new Map(),
  );
  const scrubRef = useRef<{ time: number; lastMidY: number } | null>(null);

  // ---- Selection mutation (keeps the draw-loop ref and UI count in sync) ---
  const setSelection = useCallback((ids: Set<string>) => {
    selectedNoteIdsRef.current = ids;
    setSelectionCount(ids.size);
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

  // ---- Clipboard: copy / cut / paste --------------------------------------
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

  // ---- Mirror: flip the selected notes left<->right (osu!mania "Mirror") ----
  // Columns map to keyCount-1-col; ids/times/holds/hitsounds are preserved so
  // the selection survives the move. onMoveNotes rejects the op if the flip
  // would collide with unselected notes (same as a drag-move).
  const mirrorSelection = useCallback(() => {
    const ids = selectedNoteIdsRef.current;
    if (!ids.size) return;
    const { notes, keyCount } = propsRef.current;
    const selected = notes.filter((n) => ids.has(n.id));
    if (!selected.length) return;
    propsRef.current.onMoveNotes(mirrorColumns(selected, keyCount));
  }, []);

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

  // ---- Hitsounding: apply to the selection, or set the "current" hitsound --
  // that newly placed notes adopt. Matches the osu!mania editor: W/F/C toggle
  // whistle/finish/clap, and the sample-set buttons pick normal/soft/drum.
  const toggleAddition = useCallback((bit: number) => {
    const ids = selectedNoteIdsRef.current;
    if (ids.size) {
      const selected = propsRef.current.notes.filter((n) => ids.has(n.id));
      // Toggle: clear the bit if every selected note already has it, else set it.
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

  // ---- Multi-selection keyboard state -------------------------------------
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
      // R toggles the receptors at the judgement line (osu!mania "keys").
      if (
        e.key.toLowerCase() === "r" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isTyping(e.target)
      ) {
        e.preventDefault();
        setReceptorsOn((on) => !on);
        return;
      }
      // H toggles hitsound mode (the toolbar + per-note letters + W/F/C keys).
      if (
        e.key.toLowerCase() === "h" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isTyping(e.target)
      ) {
        e.preventDefault();
        setHitsoundMode((on) => !on);
        return;
      }
      // M mirrors the selected notes left<->right (flips columns). No-op with
      // an empty selection, so it stays out of the way when nothing is picked.
      if (
        e.key.toLowerCase() === "m" &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isTyping(e.target) &&
        selectedNoteIdsRef.current.size
      ) {
        e.preventDefault();
        mirrorSelection();
        return;
      }
      // W / F / C toggle whistle / finish / clap on the selection (osu!mania).
      // Only while hitsound mode is active so they don't clash with editing.
      if (
        hitsoundModeRef.current &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !isTyping(e.target)
      ) {
        const k = e.key.toLowerCase();
        if (k === "w") {
          e.preventDefault();
          toggleAddition(HITSOUND_WHISTLE);
          return;
        }
        if (k === "f") {
          e.preventDefault();
          toggleAddition(HITSOUND_FINISH);
          return;
        }
        if (k === "c") {
          e.preventDefault();
          toggleAddition(HITSOUND_CLAP);
          return;
        }
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
  }, [copySelection, cutSelection, paste, toggleAddition, mirrorSelection]);

  // ---- Background image loading -------------------------------------------
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

  // ---- Background video loading ---------------------------------------------
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

  // ---- Skin sprite loading -------------------------------------------------
  useEffect(() => {
    const skin = props.skin;
    if (!skin) {
      skinColsRef.current = [];
      return;
    }
    // Seed colours synchronously; images fill in as they decode.
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

  // ---- Geometry helpers ----------------------------------------------------
  const updateSmoothMotion = useCallback(() => {
    const now = performance.now();
    const last = lastMotionFrameRef.current || now;
    const dt = Math.min(0.08, Math.max(0, (now - last) / 1000));
    lastMotionFrameRef.current = now;

    // Smooth scrolling: ease the displayed time toward the real audio time so
    // scrubbing between snap lines glides instead of jumping. During playback
    // (or with the setting off) track the clock exactly so notes never lag the
    // music; a large external jump still settles quickly under the easing.
    // Runs every frame, independent of the scroll-speed easing below (which
    // returns early once the speed has settled).
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

    // Ease the playfield zoom toward its target so +/- keys and the size slider
    // animate smoothly. Runs every frame (independent of the speed early-out).
    const targetScale = propsRef.current.playfieldScale || 1;
    const curScale = smoothScaleRef.current;
    smoothScaleRef.current =
      Math.abs(targetScale - curScale) < 0.002
        ? targetScale
        : curScale + (targetScale - curScale) * (1 - Math.exp(-SCROLL_SPEED_EASE * dt));

    // Scroll-speed easing (only changes when the user moves the speed slider).
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
    // Height of the scrolling region above the playhead. osu!mania fits
    // MANIA_MAX_TIME_RANGE / scrollSpeed ms of notes into this span.
    const visibleHeight = Math.max(1, sizeRef.current.height - PLAYHEAD_FROM_BOTTOM);
    return (visibleHeight * scrollSpeed) / MANIA_MAX_TIME_RANGE;
  }, []);

  // The judgement line sits near the bottom (downscroll) or near the top
  // (upscroll); notes always travel toward it as time advances.
  const playheadY = useCallback(
    () =>
      propsRef.current.upscroll
        ? PLAYHEAD_FROM_BOTTOM
        : sizeRef.current.height - PLAYHEAD_FROM_BOTTOM,
    [],
  );

  // Vertical direction of time: +1 maps future notes above the line (downscroll),
  // -1 maps them below it (upscroll). All draw + hit-test geometry derives from
  // these two helpers, so flipping the sign flips the whole playfield.
  const scrollDir = useCallback(() => (propsRef.current.upscroll ? -1 : 1), []);

  const timeToY = useCallback(
    (t: number) =>
      playheadY() - scrollDir() * (t - liveCurrentTime()) * ppms(),
    [liveCurrentTime, playheadY, ppms, scrollDir],
  );

  const yToTime = useCallback(
    (y: number) => liveCurrentTime() + (scrollDir() * (playheadY() - y)) / ppms(),
    [liveCurrentTime, playheadY, ppms, scrollDir],
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

  /** Note colour for a column: skin colour when loaded, else the default. */
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
        // The head/tail sprites extend away from the line: upward in downscroll,
        // downward in upscroll.
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

  // Notes sorted by start time (+ the longest note's duration), so the draw loop
  // can binary-search the on-screen window instead of scanning the whole map
  // every frame. maxDur lets us extend the lower bound so a long note that
  // starts above the view but whose body is still on screen isn't skipped.
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

  // High-resolution RMS envelope (2ms buckets) for the playtest hit-lane
  // waveform overlay. Recomputed once per song from the decoded PCM — the
  // bottom timeline's ~1800 whole-song buckets are far too coarse to line up
  // against individual notes.
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
    // Normalize against a high percentile (as the timeline waveform does) so
    // a few loud transients don't flatten the rest of the song.
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

  // First index in a start-time-sorted array whose startTime >= t (lower bound).
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

  // ---- Drawing -------------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { width, height, dpr } = sizeRef.current;

    // Sync the backing store here (inside the rAF draw) instead of from the
    // ResizeObserver. Resizing a canvas clears it, and the observer fires after
    // this draw but before paint - doing it there would blank the playfield for
    // the whole duration of a layout transition (e.g. toggling zen mode). Here
    // the resize and redraw happen together, so paint always shows a fresh frame.
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
    // Upscroll flips the playfield: notes rise toward a top judgement line.
    const up = propsRef.current.upscroll === true;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Backdrop
    ctx.fillStyle = "#0f0f14";
    ctx.fillRect(0, 0, width, height);

    // ---- Kiai state + beat flash ----
    // While in kiai, the background lights up on every beat of the map's BPM:
    // the flash peaks the instant a beat lands and decays before the next one.
    const ct = liveCurrentTime();
    const inKiai = kiaiAt(ct, timingPoints);
    let beatFlash = 0;
    if (inKiai) {
      const tp = activeTimingAt(ct, timingPoints);
      // Pulse at half the map's BPM (one flash every two beats).
      const bl = tp ? beatLength(tp.bpm) * 2 : 0;
      if (bl > 0) {
        const phase = ((((ct - tp.time) % bl) + bl) % bl) / bl;
        beatFlash = Math.pow(1 - phase, 2);
      }
    }

    // ---- Background video sync ----
    // The muted off-DOM <video> is slaved to the audio clock every frame:
    // play/pause follows the transport, scrubbing seeks it, and drift beyond
    // a small threshold snaps it back. Only a frame within the video's range
    // is drawn; outside it (before the offset / past the end) the background
    // image shows instead — matching how osu! treats map videos.
    const video = videoRef.current;
    let videoFrame: HTMLVideoElement | null = null;
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      const targetSec = (ct - (propsRef.current.videoOffsetMs ?? 0)) / 1000;
      const rate = propsRef.current.playbackRate ?? 1;
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

    // Optional dimmed background image / video behind the playfield
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
      // Draw background at full opacity, then overlay black scaled to dim %.
      // 0% dim = no overlay (background fully visible).
      // 100% dim = fully opaque black overlay (completely black).
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

    // Playfield panel
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(originX, 0, playfieldWidth, height);

    // Per-lane skin colour tint (subtle, so the grid stays readable).
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

    // Lane separators
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    for (let c = 0; c <= keyCount; c++) {
      const x = originX + c * laneWidth + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    // ---- Beat / snap grid (tempo-aware) ----
    // Under upscroll the screen top is the *earlier* time, so derive the visible
    // window as min/max rather than assuming top=latest.
    const edgeTimeA = yToTime(0);
    const edgeTimeB = yToTime(height);
    const topTime = Math.max(edgeTimeA, edgeTimeB);
    const bottomTime = Math.min(edgeTimeA, edgeTimeB);
    // Hidden in playtest mode: the snap grid is editor chrome with no place in
    // actual gameplay. (topTime/bottomTime are still needed below for culling.)
    if (!propsRef.current.playtestMode) {
      const lines = gridLinesInRange(
        bottomTime,
        topTime,
        timingPoints,
        view.snapDivisor,
      );
      for (const line of lines) {
        const y = Math.round(timeToY(line.time)) + 0.5;
        if (y < -4 || y > height + 4) continue;
        // Measure (bar) boundaries get a brighter, slightly heavier line.
        const color = line.barline
          ? "rgba(255,255,255,0.9)"
          : gridLineColor(line.idxInBeat, view.snapDivisor);
        // Soft glow: a wider, faint pass under the crisp line so snap lines
        // stay readable over backgrounds and lane tints.
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

    // ---- Red (uninherited) timing lines: BPM / offset ----
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

    // ---- Green (inherited) timing lines: scroll velocity (SV) ----
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

    // ---- Preview point (purple, span the canvas) ----
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

    // ---- Bookmarks (amber, span the canvas) ----
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

    // ---- Receptors (osu!mania "keys") ----
    // Drawn under the notes so taps/holds visibly fall into them. A column's
    // receptor switches to its pressed sprite while a note sits on the line.
    if (receptorsOnRef.current) {
      const currentTime = liveCurrentTime();
      const intensities = new Array<number>(keyCount).fill(0);
      const pressed = propsRef.current.playtestMode
        ? propsRef.current.pressedColumnsRef
        : null;
      if (pressed) {
        // Playtest: receptors light up from the player's own key presses, not
        // from notes passing the line (which made them flicker on every note).
        for (let c = 0; c < keyCount; c++)
          intensities[c] = pressed.current.has(c) ? 1 : 0;
      } else {
        // Editor preview: light a receptor while a note sits on the line, fading
        // out across the hit window after it passes. Only notes at/just past the
        // line matter, so binary-search that window rather than scan every note:
        // a relevant note has start <= currentTime and end >= currentTime - hit
        // window, so its start is no earlier than currentTime - maxDur - window.
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
          // Skinned receptors keep their sprite + a glow on hit.
          drawReceptor(ctx, sprite, x, phY, laneWidth, up);
          if (intensity > 0) {
            drawReceptorGlow(ctx, x, phY, laneWidth, height, noteColor(c), intensity, up);
          }
        } else if (intensity > 0) {
          // Default look: nothing when idle, just a glowing fade when hit.
          drawReceptorGlow(ctx, x, phY, laneWidth, height, noteColor(c), intensity, up);
        }
      }
    }

    // ---- Notes ----
    // With receptors on, clip to the area above the judgement line so notes
    // visibly land on the receptors and vanish at the line (like gameplay)
    // instead of sliding past them into the receptor body; hold bodies get
    // trimmed at the line too. With receptors off, draw the full playfield so
    // past notes stay visible for editing.
    const clipNotes = receptorsOnRef.current;
    // Playtest Mode draws notes unclipped so a note the player misses keeps
    // falling *through* the receptors and off-screen, instead of vanishing at
    // the line like the editor preview does. Held long notes are the exception:
    // they pin to the line while held. The editor preview (not playtest) keeps
    // clipping at the line.
    const playtest = !!propsRef.current.playtestMode;
    const heldLnIdsRef = propsRef.current.heldLnIdsRef;
    const consumedIdsRef = propsRef.current.consumedIdsRef;
    const missWindowMs = propsRef.current.missWindowMs ?? 0;
    const move = moveDragRef.current;
    // Cull notes whose whole span lies off-screen so big maps only pay for the
    // ~screenful of notes actually visible. topTime is the time at the top of
    // the view, bottomTime at the bottom; a generous pixel margin (converted to
    // ms) keeps tall sprites and long-note ends from popping at the edges.
    const cullMarginMs = 256 / ppms();
    const cullLo = bottomTime - cullMarginMs;
    const cullHi = topTime + cullMarginMs;

    // "Vanish at the line" time for the receptors-on editor preview. While
    // smooth-scrolling backwards the eased display time trails the seek target,
    // so checking against the display time alone keeps already-passed notes
    // hidden until the ease settles — they pop in at the end of the scroll.
    // Taking the earlier of display time and target time makes those notes
    // eligible immediately; the judgement-line clip then reveals them smoothly
    // as they rise across the line. Forward scrolling and playback see
    // min(display, target) === display, so their behavior is unchanged.
    const vanishTime = Math.min(
      liveCurrentTime(),
      propsRef.current.getCurrentTime(),
    );

    // Draw a single note for the current frame. In Playtest Mode a held long
    // note pins to the line, while a note the player missed keeps falling and
    // fades out once it's past the miss window. The editor preview (not playtest)
    // simply vanishes notes at the line when receptors are on.
    const paintNote = (original: ManiaNote) => {
      // A consumed note (hit, or a long note whose hold has ended) vanishes at
      // once — checked via the live ref so it doesn't linger a frame.
      if (playtest && consumedIdsRef?.current.has(original.id)) return;
      const selected = selectedNoteIdsRef.current.has(original.id);
      // While dragging the selection, draw selected notes at their offset.
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
      // A long note is "held" only in Playtest Mode while its id is in the live
      // held ref; that pins it to the line until its tail arrives.
      const held = playtest && isLN && !!heldLnIdsRef?.current.has(note.id);
      // Editor preview (receptors on, not playtest): a note vanishes once it
      // reaches the line — a rice at its head, a long note once its whole body
      // has passed. Playtest never culls here; missed notes fall through and are
      // removed only when off-screen (span cull above) or fully faded below.
      if (clipNotes && !playtest) {
        const goneAt = isLN ? note.endTime! : note.startTime;
        if (vanishTime > goneAt) return;
      }
      // Playtest: a missed note (past the line, not held) stays fully opaque
      // while it's still hittable, then fades out once past the miss window.
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
      // Default look only: notes inside a kiai section turn blue - based on the
      // note's own time, so falling notes are already blue before the playhead
      // reaches the section. Skinned notes keep their own colour.
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
        // Pin the head to the judgement line so it stays put (like gameplay)
        // until the body has fallen through. In Playtest Mode only an actually
        // held LN pins (a missed one keeps its real head position and falls
        // through); in the editor preview every LN pins while receptors are on.
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
        // Hold body spans from the head's centre out to the tail end. The (round)
        // head sprite then covers the join. `top`/`bottom` are the lower/higher
        // screen-y of that span regardless of scroll direction.
        const top = up ? headY + headH / 2 : Math.min(yEnd, headY);
        const bottom = up ? Math.max(yEnd, headY) : headY - headH / 2;
        if (bottom > top) {
          if (cr?.body) {
            const span = Math.max(bottom - top, 1);
            const dispW = laneWidth - 8;
            // A skin body bakes the rounded far-end cap into the top of its
            // image. Downscroll wants that cap at the top of the span; upscroll
            // (tail below the head) wants it at the bottom, so mirror the body
            // vertically about the span's midline before drawing it.
            ctx.save();
            if (up) {
              ctx.translate(0, top + bottom);
              ctx.scale(1, -1);
            }
            if (cr.bodyCapPx && cr.body.width > 0) {
              // Capped body: draw the rounded end at native scale at the far end,
              // then stretch only the uniform fill below it down to the head.
              // Stretching the whole (very tall) sprite would squash the cap away.
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
            // Default hold: gray body/tail, but blue inside kiai (no skin).
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
            // tail cap (head is drawn below, on top, at the judgement-facing end).
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

    // Editor preview clips notes to the approach side so they vanish at the
    // receptors. Playtest draws unclipped so a missed note falls through the
    // line and off the bottom in one piece (held LNs are pinned to the line by
    // paintNote, and hit notes are removed upstream so they never reach here).
    const clipAtLine = clipNotes && !playtest;
    if (clipAtLine) {
      ctx.save();
      ctx.beginPath();
      if (up) ctx.rect(originX, phY, playfieldWidth, height - phY);
      else ctx.rect(originX, 0, playfieldWidth, phY);
      ctx.clip();
    }
    // Playtest "hit position" offset: shift the falling notes down by this many
    // pixels so they line up below the receptors, without moving the receptors
    // themselves (drawn earlier). Visual only — judgement is audio-timed and
    // unaffected — and it never applies in the editor.
    const hitPosOffset = playtest ? propsRef.current.hitPositionOffset ?? 0 : 0;
    if (hitPosOffset) {
      ctx.save();
      ctx.translate(0, hitPosOffset);
    }
    // Playtest waveform overlay: the song's RMS envelope drawn along the
    // lane's time axis, under the notes and in the same (possibly offset)
    // space, so a note and the audio peak it maps should cross the receptors
    // together — if they don't, the map's offset is off by that gap.
    const overlay = playtest ? overlayPeaksRef.current : null;
    if (overlay) {
      const half = playfieldWidth / 2;
      const cx = originX + half;
      const step = 3;
      const pad = Math.abs(hitPosOffset) + step;
      const ys: number[] = [];
      const widths: number[] = [];
      for (let y = -pad; y <= height + pad; y += step) {
        const idx = Math.floor(yToTime(y) / overlay.bucketMs);
        const amp =
          idx >= 0 && idx < overlay.peaks.length ? overlay.peaks[idx] : 0;
        ys.push(y);
        widths.push(amp * (half - 2));
      }
      ctx.beginPath();
      ctx.moveTo(cx + widths[0], ys[0]);
      for (let i = 1; i < ys.length; i++) ctx.lineTo(cx + widths[i], ys[i]);
      for (let i = ys.length - 1; i >= 0; i--) ctx.lineTo(cx - widths[i], ys[i]);
      ctx.closePath();
      ctx.fillStyle = "rgba(125,211,252,0.16)";
      ctx.fill();
    }
    // Iterate only the notes whose span can reach the screen. While a selection
    // is being move-dragged, the dragged notes shift in time, so fall back to a
    // full scan (drags are brief and never the perf-critical playback path).
    if (move) {
      for (const original of notes) paintNote(original);
    } else {
      const { list: sorted, maxDur } = sortedNotesRef.current;
      // Extend the lower bound by maxDur so an LN starting above the window but
      // ending inside it is still drawn; paintNote does the precise per-note cull.
      let i = firstNoteFrom(sorted, cullLo - maxDur);
      for (; i < sorted.length; i++) {
        const n = sorted[i];
        if (n.startTime > cullHi) break;
        paintNote(n);
      }
    }
    if (hitPosOffset) ctx.restore();
    if (clipAtLine) ctx.restore();

    // ---- Active long-note drag preview ----
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

    // ---- Hover ghost note (unsnapped — follows cursor exactly) ----
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
        // Center the ghost on the cursor X so it tracks the mouse smoothly
        // instead of jumping to the column's left edge.
        const x = mouseRef.current.x - laneWidth / 2;
        const y = timeToY(t);
        // Always use column 0's colour/sprite so the ghost doesn't change as
        // the cursor crosses column boundaries.
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

    // ---- Multi-selection drag rectangle ----
    const selection = selectionDragRef.current;
    if (selection) {
      const rect = selectionScreenRect(selection);
      // Clamp the *drawn* rectangle to a small inset so it visibly stops short
      // of the canvas edge — including its time-anchored corner, which can
      // otherwise scroll off-screen while dragging. Hit-testing on mouse-up uses
      // the unclamped rect, so notes beyond the edge still get selected.
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

    // ---- Playhead (judgement line) ----
    ctx.strokeStyle = "#e86868";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(originX, phY);
    ctx.lineTo(originX + playfieldWidth, phY);
    ctx.stroke();

    // ---- Pulsing ★ KIAI ★ label, just right of the playfield bottom ----
    if (inKiai && !propsRef.current.zenMode) {
      // Brightens on every beat (beatFlash) over a gentle idle blink.
      const blink = 0.3 + 0.2 * (0.5 + 0.5 * Math.sin(performance.now() / 280));
      const alpha = Math.min(1, blink + beatFlash * 0.6);
      const x = originX + playfieldWidth + 10;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = "#e86868";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      // Star scales up slightly with the beat for a little sparkle.
      ctx.font = `${12 + beatFlash * 6}px ${CANVAS_FONT_STACK}`;
      ctx.fillText("★", x, phY);
      ctx.font = `bold 13px ${CANVAS_FONT_STACK}`;
      ctx.fillText("KIAI", x + 16, phY);
      ctx.font = `${12 + beatFlash * 6}px ${CANVAS_FONT_STACK}`;
      ctx.fillText("★", x + 52, phY);
      ctx.restore();
    }

    // ---- FPS / frame-time HUD (?fps) ----
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

  // ---- render loop ---------------------------------------------------------
  // requestAnimationFrame is the smoothest option in a browser: the callback is
  // frame-paced to the compositor, so each draw lines up with a vsync present
  // (no off-cadence judder) and it runs at the display's full refresh rate —
  // 60, 144, 360Hz, whatever the monitor does. (A faster off-vsync loop only
  // draws frames the compositor throws away while burning a core, which makes
  // playback *less* smooth, not more.) Motion is dt-based (see
  // updateSmoothMotion) so it's correct at any refresh rate.
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
        // Roll up the measured fps once per second.
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

  // ---- Resize handling -----------------------------------------------------
  // Only record the container size; the rAF draw syncs the canvas backing store
  // (see draw()), which the CSS `h-full w-full` canvas is stretched to fill.
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

  // ---- Pointer interaction -------------------------------------------------
  const localPoint = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };


  const findNoteAt = (x: number, y: number): ManiaNote | null => {
    const { notes, keyCount } = propsRef.current;
    const col = columnAtX(x);
    if (col < 0) return null;
    const { laneWidth, originX } = laneGeometry();
    // Search from topmost drawn (latest) so overlapping notes resolve sanely.
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
      // Intensity keys off the *raw* cursor position so speed keeps ramping the
      // further past the edge you drag, instead of pinning to the clamped box.
      const rawY = selection.rawY;
      let dir: 1 | -1 | 0 = 0;
      let intensity = 0;

      // `dir` is the time direction (advance / rewind), so the screen edge that
      // means "advance" flips with scroll direction: the top edge points to the
      // future in downscroll, the bottom edge in upscroll.
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
    if (e.button !== 0) return; // left only
    if (props.playtestMode) {
      e.preventDefault();
      return;
    }
    const { x, y } = localPoint(e);
    // View-only collaborators may still box-select (to copy/comment) but cannot
    // place, drag or otherwise modify notes.
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

    // Grabbing a note starts a drag-to-move of the whole selection.
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

    // Empty space: clear any selection, then begin placing a note.
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
      // Clamp the box to just inside the canvas so it visibly stops short of the
      // editor edge instead of running off when the pointer leaves the notefield.
      const { width, height } = sizeRef.current;
      const cx = Math.max(SELECT_EDGE_INSET, Math.min(x, width - SELECT_EDGE_INSET));
      const cy = Math.max(SELECT_EDGE_INSET, Math.min(y, height - SELECT_EDGE_INSET));
      selection.currentX = cx;
      selection.currentY = cy;
      selection.rawY = y;
      selection.currentTime = yToTime(cy);
      // NB: do *not* reset the autoscroll accumulator here. Resetting on every
      // move made hand-jitter (common while dragging off-canvas) restart the
      // scroll from the eased/lagging clock each frame — the source of the
      // stutter. The autoscroll loop clears it on its own once out of the zone.
      return;
    }

    const move = moveDragRef.current;
    if (move) {
      const { keyCount } = propsRef.current;
      const { laneWidth } = laneGeometry();

      // Time: follow the mouse smoothly while dragging; final notes snap on
      // mouse-up if the selection moved vertically.
      const rawDelta = yToTime(y) - yToTime(move.startY);
      if (move.timeMoved || Math.abs(y - move.startY) > 3) {
        move.timeMoved = true;
        move.timeDelta = rawDelta;
      } else {
        move.timeDelta = 0;
      }

      // Columns: step by whole lanes, clamped so nothing leaves the playfield.
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
    // A mouse box-select holding pointer capture is intentionally *not*
    // cancelled here — capture keeps its move/up events flowing off-canvas so
    // the drag continues (clamped to the edge) until the button is released.
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

  // ---- Pointer routing (mouse + touch + pen) -------------------------------
  // A single pointer path so the notefield works with a finger, a stylus or a
  // mouse. Mouse keeps its exact previous behavior (delegates straight to the
  // legacy mouse handlers, no pointer capture). Touch/pen additionally gets:
  //   • pointer capture, so a drag keeps tracking if the finger leaves the canvas
  //   • two-finger vertical drag to scrub time (there is no wheel on touch)
  //   • touch-action:none on the canvas so the browser never steals the gesture
  const averagePointerY = (pts: Map<number, { x: number; y: number }>) => {
    let sum = 0;
    for (const p of pts.values()) sum += p.y;
    return pts.size ? sum / pts.size : 0;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      onMouseDown(e);
      // If that began a box-select, capture the pointer so the drag keeps
      // tracking (clamped to the edge) after the cursor leaves the canvas and
      // still commits on release outside the notefield — same mechanism the
      // touch/pen path uses.
      if (selectionDragRef.current) {
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
          boxSelectCapturedRef.current = true;
        } catch {
          /* capture unsupported / pointer already gone */
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
      /* capture unsupported / pointer already gone */
    }
    if (pts.size >= 2) {
      // Second finger down: abandon any single-finger edit and start scrubbing.
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
      // Time-per-pixel (sign encodes scroll direction); moving content with the
      // finger keeps the point under it roughly fixed, like touch-scrolling.
      const msPerPx = yToTime(1) - yToTime(0);
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
          /* nothing to release */
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
      /* nothing to release */
    }
    if (scrubRef.current) {
      // Lifting out of a scrub: never treat the release as a note placement.
      if (pts.size < 2) scrubRef.current = null;
      return;
    }
    onMouseUp(e);
  };

  const onPointerCancel = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse") {
      // A cancelled mouse box-select: drop the capture flag and the drag so it
      // doesn't get stuck on-screen.
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
    // Preserve the mouse "cancel drag when the cursor leaves" behavior. Touch
    // uses pointer capture, so it keeps tracking and ignores leave.
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
      // Alt + scroll => adjust volume by 5% per notch.
      props.onVolumeChange(e.deltaY < 0 ? 0.05 : -0.05);
      return;
    }
    // Scroll up => advance in time. Step one beat-snap division per notch so the
    // playhead always lands exactly on a snap line. Step from the true audio time
    // (not the eased display time) so consecutive notches accumulate cleanly
    // while smooth scrolling is still gliding toward the last target.
    const { timingPoints, view } = propsRef.current;
    const currentTime = propsRef.current.getCurrentTime();
    const dir: 1 | -1 = e.deltaY < 0 ? -1 : 1;
    const firstStep = stepToSnap(currentTime, timingPoints, view.snapDivisor, dir);
    const target =
      dir < 0 && propsRef.current.isPlaying
        ? stepToSnap(firstStep, timingPoints, view.snapDivisor, dir)
        : firstStep;
    props.onSeek(target);
  };

  // When notes are selected the toolbar reflects (and edits) those notes; with
  // no selection it reflects the "current" hitsound applied to new notes.
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
        : -1 // mixed selection
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

      {/* Receptor toggle indicator (press R) */}
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

      {/* Hitsound mode indicator (only while active; press H to toggle) */}
      {hitsoundMode && !props.playtestMode && (
        <div className="pointer-events-none absolute left-3 top-[3.25rem] select-none rounded-md border border-emerald-300/40 bg-emerald-500/15 px-3 py-1.5 text-xs font-medium text-emerald-100 shadow-lg">
          Hitsound mode · W / F / C · press H to exit
        </div>
      )}

      {/* Selection action hint */}
      {selectionCount > 0 && !props.playtestMode && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 select-none rounded-md border border-yellow-300/30 bg-ink-800/80 px-3 py-1.5 text-[11px] text-slate-200 shadow-lg">
          <span className="font-medium text-yellow-200">
            {selectionCount} selected
          </span>{" "}
          · Delete/right-click remove · Ctrl+click multi · drag to move · Ctrl+A all · Ctrl+C copy · Ctrl+X cut
        </div>
      )}

      {/* Clipboard preview + pasteboard history */}
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

      {/* Hitsound toolbar - W whistle · F finish · C clap, plus sample set. */}
      {hitsoundMode && !props.zenMode && (
        <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-ink-600 bg-ink-800/90 px-2.5 py-1.5 text-xs text-slate-200 shadow-xl backdrop-blur">
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
        </div>
      )}
    </div>
  );
}

/** A single whistle/finish/clap toggle button in the hitsound toolbar. */
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

/** Tiny SVG thumbnail of a clipboard entry: lanes across, time vertical. */
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
  const riceH = size === "large" ? 6 : 3; // rice-note thickness
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

/**
 * A clipboard thumbnail that reveals a larger, easier-to-read copy of itself to
 * its left while hovered. Used in the pasteboard list where the inline previews
 * are intentionally tiny.
 */
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
      {/* Enlarged hover preview, anchored to the left of the thumbnail. */}
      <span className="pointer-events-none absolute right-full top-1/2 z-30 mr-2 -translate-y-1/2 rounded-md border border-ink-500 bg-ink-900/95 p-2 opacity-0 shadow-2xl transition-opacity duration-150 group-hover/clip:opacity-100">
        <ClipPreview clip={clip} keyCount={keyCount} size="large" />
      </span>
    </span>
  );
}

// ---- Small canvas utilities ------------------------------------------------
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

/**
 * Draw a note sprite centred vertically on `centerY`, fitted to the lane width
 * with its aspect ratio preserved (matching how osu! scales mania notes).
 */
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
    // Upscroll: anchor the note's top edge on its snap line and mirror the
    // sprite vertically so its leading edge / cap faces the (top) judgement line.
    ctx.save();
    ctx.translate(0, bottomY + h);
    ctx.scale(1, -1);
    ctx.drawImage(img, x + 3, 0, w, h);
    ctx.restore();
    return;
  }
  // Anchor the note's bottom edge on its snap line so it sits on the line
  // rather than straddling it.
  ctx.drawImage(img, x + 3, bottomY - h, w, h);
}

/**
 * Lowest non-transparent row (in image pixels) of a sprite, cached per image so
 * the pixel scan runs only once. Used to ignore transparent padding below a
 * receptor's artwork so its visible bottom - not the image's bottom - can be
 * placed on the judgement line. Returns img.height if the bounds can't be read
 * (e.g. a tainted canvas).
 */
const opaqueBottomCache = new WeakMap<HTMLImageElement, number>();
function opaqueBottom(img: HTMLImageElement): number {
  const cached = opaqueBottomCache.get(img);
  if (cached !== undefined) return cached;
  let bottom = img.height;
  try {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const cx = c.getContext("2d");
    if (cx) {
      cx.drawImage(img, 0, 0);
      const { data } = cx.getImageData(0, 0, img.width, img.height);
      for (let y = img.height - 1; y >= 0; y--) {
        let opaque = false;
        for (let x = 0; x < img.width; x++) {
          if (data[(y * img.width + x) * 4 + 3] > 8) {
            opaque = true;
            break;
          }
        }
        if (opaque) {
          bottom = y + 1;
          break;
        }
      }
    }
  } catch {
    bottom = img.height;
  }
  opaqueBottomCache.set(img, bottom);
  return bottom;
}

/**
 * Draw a receptor (the osu!mania "key") for one column. The sprite's visible
 * bottom edge (ignoring transparent padding) rests on the judgement line, scaled
 * to lane width with aspect preserved, so a falling note - also bottom-anchored
 * on the line - lands directly on the receptor.
 */
function drawReceptor(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  lineY: number,
  laneWidth: number,
  up = false,
) {
  if (img.width <= 0 || img.height <= 0) return;
  const s = laneWidth / img.width;
  // Offset upward so the artwork's opaque bottom - not the padded image bottom -
  // lands exactly on the line.
  const dy = lineY - opaqueBottom(img) * s;
  if (up) {
    // Upscroll: mirror the receptor about the (top) judgement line so its
    // opaque edge stays on the line and the key extends downward into the stage.
    ctx.save();
    ctx.translate(0, lineY * 2);
    ctx.scale(1, -1);
    ctx.drawImage(img, x, dy, laneWidth, img.height * s);
    ctx.restore();
    return;
  }
  ctx.drawImage(img, x, dy, laneWidth, img.height * s);
}

/**
 * Additive lane-coloured glow over the receptor, brightest at the judgement
 * line and fading toward the stage floor. Drawn whenever a note is on the line
 * so the receptor always reads as "hit", regardless of the active skin.
 */
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
  // The glow spreads from the line toward the stage floor — below the line in
  // downscroll, above it (toward the screen top) in upscroll.
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
