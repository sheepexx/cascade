import { type ManiaKeymodeSkin, type ManiaNote, type TimingPoint, type ViewState } from "../../types";
import { type EditorKeybinds } from "../../lib/editorKeybinds";
import { type PatternNote } from "../../lib/patterns";
import type { prepareNotePaste } from "../../lib/editorClipboard";
import { type DifficultyClip, type NoteClip } from "../../lib/clipboardStore";
import { type LaneColourScheme } from "../../lib/laneColours";
import type { Waveform } from "../../hooks/useWaveform";
import { type AudioSeekSignal, type AudioSeekTransition } from "../../lib/audioSeek";

/**
 * Types the editor's component and its hooks share.
 */

export type HitsoundSource = {
  id: string;
  name: string;
  hitsoundCount: number;
  noteCount: number;
};

export type ManiaEditorProps = {
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
  /** Draw the glow under a column as a note is hit. */
  hitLight?: boolean;
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
};

export type DragState = {
  column: number;
  startTime: number;
  currentTime: number;
  replace?: ManiaNote;
  /** Dragging an existing long note's tail; currentTime is its new end. */
  resize?: boolean;
};

export type InteractionMode = "edit" | "select";

export type SelectionDragState = {
  startX: number;
  startY: number;
  startTime: number;
  currentX: number;
  currentY: number;
  currentTime: number;
  rawY: number;
};

export type MoveDragState = {
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

export type Clip = NoteClip;

export type ClipDropPreview = {
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
