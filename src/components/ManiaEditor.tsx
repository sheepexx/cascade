import { useCallback, useEffect, useRef, useState } from "react";
import {
  uid,
  type ManiaKeymodeSkin,
  type ManiaNote,
  type TimingPoint,
  type ViewState,
} from "../types";
import {
  gridLineColor,
  gridLinesInRange,
  snapTime,
  sortedPoints,
  stepToSnap,
} from "../lib/timing";

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
 *   - Right click on a note: delete it.
 *   - Mouse wheel: scrub through time.
 */

// osu!lazer mania MAX_TIME_RANGE: ms of notes visible above the hit line at
// scroll speed 1. The visible window shrinks to ~287ms at scroll speed 40.
const MANIA_MAX_TIME_RANGE = 11485;
const PLAYHEAD_FROM_BOTTOM = 96;
const NOTE_HEIGHT = 16;
const HIT_TOLERANCE = 14; // px radius for right-click delete
const BACKGROUND_MAX_ALPHA = 0.12;
const BACKGROUND_FADE_DELAY_MS = 700;
const BACKGROUND_FADE_MS = 500;
// osu!lazer font stack for canvas text — mirrors --font-osu / tailwind `sans`.
const CANVAS_FONT_STACK =
  '"Torus", "Torus-Alternate", "Inter", ui-sans-serif, system-ui, sans-serif';

type Props = {
  notes: ManiaNote[];
  keyCount: number;
  timingPoints: TimingPoint[];
  previewTime: number;
  view: ViewState;
  currentTime: number;
  backgroundUrl: string | null;
  /** Skin assets for the active keymode, or null to use the default look. */
  skin: ManiaKeymodeSkin | null;
  /** Multiplies the on-screen playfield / lane size. Default 1. */
  playfieldScale: number;
  /** Width multiplier for the default long-note body. Default 1. */
  longNoteBodyScale: number;
  onPlaceNote: (note: ManiaNote) => void;
  onDeleteNote: (id: string) => void;
  onAddNotes: (notes: ManiaNote[]) => void;
  onDeleteNotes: (ids: string[]) => void;
  onMoveNotes: (notes: ManiaNote[]) => void;
  onSeek: (ms: number) => void;
};

type DragState = {
  column: number;
  startTime: number;
  currentTime: number;
};

type SelectionDragState = {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
};

/** In-progress drag of the current selection to a new column / time. */
type MoveDragState = {
  startX: number;
  startY: number;
  /** Lane offset applied to every selected note (clamped to the playfield). */
  colDelta: number;
  /** Time offset (ms) applied to every selected note (snapped via anchor). */
  timeDelta: number;
  /** Becomes true once the pointer has actually moved (vs. a plain click). */
  moved: boolean;
  /** Original positions of the dragged notes, captured at mousedown. */
  origin: { id: string; column: number; startTime: number; endTime?: number }[];
};

/**
 * A clipboard entry: notes normalized so the earliest one starts at time 0.
 * Columns stay absolute so paste lands in the same lanes.
 */
type Clip = {
  id: string;
  notes: { column: number; startTime: number; endTime?: number }[];
};

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
};

export function ManiaEditor(props: Props) {
  const [shiftActive, setShiftActive] = useState(false);
  const [selectionCount, setSelectionCount] = useState(0);
  const [clipboard, setClipboard] = useState<Clip | null>(null);
  const [history, setHistory] = useState<Clip[]>([]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const bgImgRef = useRef<HTMLImageElement | null>(null);
  const bgFadeStartRef = useRef(0);
  // Resolved skin sprites/colours per column. Read by the rAF draw loop.
  const skinColsRef = useRef<ColumnRender[]>([]);
  const shiftActiveRef = useRef(false);
  const selectedNoteIdsRef = useRef<Set<string>>(new Set());
  const clipboardRef = useRef<Clip | null>(null);
  clipboardRef.current = clipboard;

  // Mutable mirror of props so the rAF draw loop always reads fresh values.
  const propsRef = useRef(props);
  propsRef.current = props;

  const sizeRef = useRef({ width: 800, height: 600, dpr: 1 });
  const mouseRef = useRef<{ x: number; y: number; inside: boolean }>({
    x: 0,
    y: 0,
    inside: false,
  });
  const dragRef = useRef<DragState | null>(null);
  const selectionDragRef = useRef<SelectionDragState | null>(null);
  const moveDragRef = useRef<MoveDragState | null>(null);

  // ---- Selection mutation (keeps the draw-loop ref and UI count in sync) ---
  const setSelection = useCallback((ids: Set<string>) => {
    selectedNoteIdsRef.current = ids;
    setSelectionCount(ids.size);
  }, []);

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
  }, [setSelection]);

  const cutSelection = useCallback(() => {
    if (copySelection()) deleteSelection();
  }, [copySelection, deleteSelection]);

  const paste = useCallback(() => {
    const clip = clipboardRef.current;
    if (!clip) return;
    const { currentTime, timingPoints, view, keyCount } = propsRef.current;
    const base = snapTime(currentTime, timingPoints, view.snapDivisor);
    const newNotes: ManiaNote[] = clip.notes
      .filter((n) => n.column >= 0 && n.column < keyCount)
      .map((n) => ({
        id: uid("n"),
        column: n.column,
        startTime: n.startTime + base,
        endTime: n.endTime !== undefined ? n.endTime + base : undefined,
      }));
    if (!newNotes.length) return;
    propsRef.current.onAddNotes(newNotes);
    setSelection(new Set(newNotes.map((n) => n.id)));
  }, [setSelection]);

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
      if (e.key === "Shift") setShift(true);
      if (!(e.ctrlKey || e.metaKey) || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "c") {
        if (copySelection()) e.preventDefault();
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
      if (e.key === "Shift") {
        setShift(false);
        selectionDragRef.current = null;
      }
    };
    const onBlur = () => {
      setShift(false);
      selectionDragRef.current = null;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [copySelection, cutSelection, paste]);

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
    });
    return () => {
      cancelled = true;
    };
  }, [props.skin]);

  // ---- Geometry helpers ----------------------------------------------------
  const ppms = useCallback(() => {
    const { scrollSpeed } = propsRef.current.view;
    // Height of the scrolling region above the playhead. osu!mania fits
    // MANIA_MAX_TIME_RANGE / scrollSpeed ms of notes into this span.
    const visibleHeight = Math.max(1, sizeRef.current.height - PLAYHEAD_FROM_BOTTOM);
    return (visibleHeight * scrollSpeed) / MANIA_MAX_TIME_RANGE;
  }, []);

  const playheadY = useCallback(
    () => sizeRef.current.height - PLAYHEAD_FROM_BOTTOM,
    [],
  );

  const timeToY = useCallback(
    (t: number) => playheadY() - (t - propsRef.current.currentTime) * ppms(),
    [playheadY, ppms],
  );

  const yToTime = useCallback(
    (y: number) => propsRef.current.currentTime + (playheadY() - y) / ppms(),
    [playheadY, ppms],
  );

  const laneGeometry = useCallback(() => {
    const { width } = sizeRef.current;
    const keys = propsRef.current.keyCount;
    const scale = propsRef.current.playfieldScale || 1;
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
      if (note.endTime !== undefined && note.endTime > note.startTime) {
        const yStart = timeToY(note.startTime);
        const yEnd = timeToY(note.endTime);
        const top = Math.min(yStart, yEnd) - NOTE_HEIGHT / 2;
        const bottom = Math.max(yStart, yEnd) + NOTE_HEIGHT / 2;
        return {
          x: x + 3,
          y: top,
          w: laneWidth - 6,
          h: Math.max(NOTE_HEIGHT, bottom - top),
        };
      }

      const y = timeToY(note.startTime);
      return {
        x: x + 3,
        y: y - NOTE_HEIGHT / 2,
        w: laneWidth - 6,
        h: NOTE_HEIGHT,
      };
    },
    [timeToY],
  );

  // ---- Drawing -------------------------------------------------------------
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const { width, height, dpr } = sizeRef.current;

    // Sync the backing store here (inside the rAF draw) instead of from the
    // ResizeObserver. Resizing a canvas clears it, and the observer fires after
    // this draw but before paint — doing it there would blank the playfield for
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

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Backdrop
    ctx.fillStyle = "#0f0f14";
    ctx.fillRect(0, 0, width, height);

    // Optional dimmed background image behind the playfield
    const bg = bgImgRef.current;
    if (bg) {
      const elapsed =
        performance.now() - bgFadeStartRef.current - BACKGROUND_FADE_DELAY_MS;
      const progress =
        bgFadeStartRef.current > 0
          ? Math.min(1, Math.max(0, elapsed / BACKGROUND_FADE_MS))
          : 1;
      const eased = 1 - Math.pow(1 - progress, 3);
      ctx.globalAlpha = BACKGROUND_MAX_ALPHA * eased;
      drawCover(ctx, bg, 0, 0, width, height);
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
    const topTime = yToTime(0);
    const bottomTime = yToTime(height);
    const lines = gridLinesInRange(
      bottomTime,
      topTime,
      timingPoints,
      view.snapDivisor,
    );
    for (const line of lines) {
      const y = Math.round(timeToY(line.time)) + 0.5;
      if (y < -2 || y > height + 2) continue;
      ctx.strokeStyle = gridLineColor(line.idxInBeat, view.snapDivisor);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(originX, y);
      ctx.lineTo(originX + playfieldWidth, y);
      ctx.stroke();
    }

    // ---- Timing point / offset lines (red, span the canvas) ----
    for (const tp of sortedPoints(timingPoints)) {
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

    // ---- Preview point (green, span the canvas) ----
    if (previewTime >= 0) {
      const y = timeToY(previewTime);
      if (y >= -20 && y <= height + 20) {
        ctx.strokeStyle = "#33d17a";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
        ctx.fillStyle = "#33d17a";
        ctx.font = `11px ${CANVAS_FONT_STACK}`;
        ctx.fillText("Preview Point", 6, y - 4);
      }
    }

    // ---- Notes ----
    const move = moveDragRef.current;
    for (const original of notes) {
      const selected = selectedNoteIdsRef.current.has(original.id);
      // While dragging the selection, draw selected notes at their offset.
      const note =
        move && selected
          ? {
              ...original,
              column: original.column + move.colDelta,
              startTime: original.startTime + move.timeDelta,
              endTime:
                original.endTime !== undefined
                  ? original.endTime + move.timeDelta
                  : undefined,
            }
          : original;
      if (note.column < 0 || note.column >= keyCount) continue;
      const x = originX + note.column * laneWidth;
      const cr = skinCols[note.column];
      const color = noteColor(note.column);
      const bounds = noteBounds(note, laneWidth, originX);

      if (note.endTime !== undefined && note.endTime > note.startTime) {
        const yStart = timeToY(note.startTime);
        const yEnd = timeToY(note.endTime);
        const top = Math.min(yStart, yEnd);
        const bottom = Math.max(yStart, yEnd);
        // Hold body. A skin's body sprite already bakes the far-end cap into the
        // top of its image (the rounded edge), so when one exists we let its own
        // top form the LN's end — drawing a separate tail sprite on top would
        // only bury that finished end. Without a skin body we fall back to the
        // default fill plus an explicit tail cap.
        if (cr?.body) {
          const span = Math.max(bottom - top, 1);
          const dispW = laneWidth - 8;
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
        } else {
          const bodyW = (laneWidth - 8) * (propsRef.current.longNoteBodyScale || 1);
          ctx.fillStyle = "rgba(154,160,173,0.35)";
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
            drawSprite(ctx, cr.tail, x, yEnd, laneWidth);
          } else {
            ctx.fillStyle = "#9aa0ad";
            roundRect(ctx, x + 3, yEnd - NOTE_HEIGHT / 2, laneWidth - 6, NOTE_HEIGHT, 4);
            ctx.fill();
          }
        }
        const headSprite = cr?.head ?? cr?.note ?? null;
        if (headSprite) {
          drawSprite(ctx, headSprite, x, yStart, laneWidth);
        } else {
          ctx.fillStyle = color;
          roundRect(ctx, x + 3, yStart - NOTE_HEIGHT / 2, laneWidth - 6, NOTE_HEIGHT, 4);
          ctx.fill();
        }
      } else {
        const y = timeToY(note.startTime);
        if (cr?.note) {
          drawSprite(ctx, cr.note, x, y, laneWidth);
        } else {
          ctx.fillStyle = color;
          roundRect(ctx, x + 3, y - NOTE_HEIGHT / 2, laneWidth - 6, NOTE_HEIGHT, 4);
          ctx.fill();
        }
      }

      if (selected && bounds) {
        ctx.strokeStyle = "#ffd23f";
        ctx.lineWidth = 2;
        roundRect(ctx, bounds.x - 2, bounds.y - 2, bounds.w + 4, bounds.h + 4, 6);
        ctx.stroke();
      }
    }

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
    } else if (mouseRef.current.inside && !moveDragRef.current) {
      // ---- Hover ghost note ----
      const col = columnAtX(mouseRef.current.x);
      if (col >= 0) {
        const t = snapTime(
          yToTime(mouseRef.current.y),
          timingPoints,
          view.snapDivisor,
        );
        const x = originX + col * laneWidth;
        const y = timeToY(t);
        const ghost = skinCols[col]?.note ?? null;
        ctx.globalAlpha = 0.45;
        if (ghost) {
          drawSprite(ctx, ghost, x, y, laneWidth);
        } else {
          ctx.fillStyle = noteColor(col);
          roundRect(ctx, x + 3, y - NOTE_HEIGHT / 2, laneWidth - 6, NOTE_HEIGHT, 4);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
    }

    // ---- Multi-selection drag rectangle ----
    const selection = selectionDragRef.current;
    if (selection) {
      const rect = normalizeRect(
        selection.startX,
        selection.startY,
        selection.currentX,
        selection.currentY,
      );
      ctx.fillStyle = "rgba(255,210,63,0.12)";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w, rect.h);
      ctx.setLineDash([]);
    }

    // ---- Playhead (judgement line) ----
    ctx.strokeStyle = "#ff5db1";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(originX, phY);
    ctx.lineTo(originX + playfieldWidth, phY);
    ctx.stroke();

    ctx.restore();
  }, [columnAtX, laneGeometry, noteBounds, playheadY, timeToY, yToTime]);

  // ---- rAF render loop -----------------------------------------------------
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

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
    // Search from topmost drawn (latest) so overlapping notes resolve sanely.
    for (let i = notes.length - 1; i >= 0; i--) {
      const n = notes[i];
      if (n.column !== col || n.column >= keyCount) continue;
      const yStart = timeToY(n.startTime);
      if (n.endTime !== undefined) {
        const yEnd = timeToY(n.endTime);
        const top = Math.min(yStart, yEnd) - NOTE_HEIGHT / 2;
        const bottom = Math.max(yStart, yEnd) + NOTE_HEIGHT / 2;
        if (y >= top && y <= bottom) return n;
      } else if (Math.abs(y - yStart) <= HIT_TOLERANCE) {
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

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // left only
    const { x, y } = localPoint(e);
    if (e.shiftKey || shiftActiveRef.current) {
      e.preventDefault();
      dragRef.current = null;
      selectionDragRef.current = {
        startX: x,
        startY: y,
        currentX: x,
        currentY: y,
      };
      setSelection(new Set());
      return;
    }

    // Grabbing a note starts a drag-to-move of the whole selection.
    const hit = findNoteAt(x, y);
    if (hit) {
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
        }));
      moveDragRef.current = {
        startX: x,
        startY: y,
        colDelta: 0,
        timeDelta: 0,
        moved: false,
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
    const { x, y } = localPoint(e);
    mouseRef.current = { x, y, inside: true };
    const selection = selectionDragRef.current;
    if (selection) {
      selection.currentX = x;
      selection.currentY = y;
      return;
    }

    const move = moveDragRef.current;
    if (move) {
      const { timingPoints, view, keyCount } = propsRef.current;
      const { laneWidth } = laneGeometry();

      // Time: snap the anchor note's new start, derive a shared delta.
      const anchor = move.origin[0];
      const rawDelta = yToTime(y) - yToTime(move.startY);
      const snappedAnchor = snapTime(
        anchor.startTime + rawDelta,
        timingPoints,
        view.snapDivisor,
      );
      move.timeDelta = snappedAnchor - anchor.startTime;

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

    const move = moveDragRef.current;
    if (move) {
      moveDragRef.current = null;
      if (move.moved && (move.colDelta !== 0 || move.timeDelta !== 0)) {
        propsRef.current.onMoveNotes(
          move.origin.map((o) => ({
            id: o.id,
            column: o.column + move.colDelta,
            startTime: o.startTime + move.timeDelta,
            endTime:
              o.endTime !== undefined ? o.endTime + move.timeDelta : undefined,
          })),
        );
      }
      return;
    }

    const selection = selectionDragRef.current;
    if (selection) {
      selectionDragRef.current = null;
      selectNotesInRect(
        normalizeRect(
          selection.startX,
          selection.startY,
          selection.currentX,
          selection.currentY,
        ),
      );
      return;
    }

    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;

    const start = Math.min(drag.startTime, drag.currentTime);
    const end = Math.max(drag.startTime, drag.currentTime);
    const id = uid("n");

    if (end - start <= 0) {
      // Plain tap
      props.onPlaceNote({ id, column: drag.column, startTime: start });
    } else {
      props.onPlaceNote({
        id,
        column: drag.column,
        startTime: start,
        endTime: end,
      });
    }
  };

  const onMouseLeave = () => {
    mouseRef.current.inside = false;
    dragRef.current = null;
    selectionDragRef.current = null;
    moveDragRef.current = null;
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = localPoint(e);
    const note = findNoteAt(x, y);
    if (note) {
      // Right-click a selected note → delete the whole selection.
      if (selectedNoteIdsRef.current.has(note.id)) {
        deleteSelection();
      } else {
        props.onDeleteNote(note.id);
      }
      return;
    }
    // Right-click empty space → deselect.
    if (selectedNoteIdsRef.current.size) setSelection(new Set());
  };

  const onWheel = (e: React.WheelEvent) => {
    // Scroll up => advance in time. Step one beat-snap division per notch so the
    // playhead always lands exactly on a snap line.
    const { currentTime, timingPoints, view } = propsRef.current;
    const dir: 1 | -1 = e.deltaY < 0 ? 1 : -1;
    props.onSeek(stepToSnap(currentTime, timingPoints, view.snapDivisor, dir));
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block h-full w-full cursor-crosshair"
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
        onContextMenu={onContextMenu}
        onWheel={onWheel}
      />
      <div
        className={`pointer-events-none absolute right-3 top-3 select-none rounded-md border border-yellow-300/40 bg-yellow-500/15 px-3 py-1.5 text-xs font-medium text-yellow-100 shadow-lg transition-[opacity,transform] duration-150 ${
          shiftActive
            ? "translate-y-0 opacity-100"
            : "-translate-y-2 opacity-0"
        }`}
      >
        Multi selection active
      </div>

      {/* Selection action hint */}
      {selectionCount > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 select-none rounded-md border border-yellow-300/30 bg-ink-800/80 px-3 py-1.5 text-[11px] text-slate-200 shadow-lg">
          <span className="font-medium text-yellow-200">
            {selectionCount} selected
          </span>{" "}
          · drag to move · Ctrl+C copy · Ctrl+X cut · right-click delete
        </div>
      )}

      {/* Clipboard preview + pasteboard history */}
      {(clipboard || history.length > 0) && (
        <div className="absolute right-3 top-14 w-44 select-none rounded-lg border border-ink-600 bg-ink-800/90 p-2 text-xs text-slate-300 shadow-xl backdrop-blur">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-medium text-slate-200">Clipboard</span>
            <span className="text-[10px] text-slate-500">Ctrl+V</span>
          </div>
          {clipboard ? (
            <div className="flex items-center gap-2 rounded-md border border-yellow-300/40 bg-yellow-500/5 p-1.5">
              <ClipThumb clip={clipboard} keyCount={props.keyCount} />
              <span className="text-[10px] text-slate-400">
                {clipboard.notes.length} note
                {clipboard.notes.length === 1 ? "" : "s"}
              </span>
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
    </div>
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
              fill="#ff5db1"
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
  centerY: number,
  laneWidth: number,
) {
  const w = laneWidth - 6;
  const h = img.width > 0 ? img.height * (w / img.width) : NOTE_HEIGHT;
  ctx.drawImage(img, x + 3, centerY - h / 2, w, h);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  const ir = img.width / img.height;
  const r = dw / dh;
  let sw = img.width;
  let sh = img.height;
  if (ir > r) {
    sw = img.height * r;
  } else {
    sh = img.width / r;
  }
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
