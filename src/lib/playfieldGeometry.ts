import type { AppSettings, PlaytestSettings, ViewState } from "../types";

/** Pixels from the scroll edge of the playfield to the judgement line. */
export const PLAYHEAD_FROM_EDGE = 96;

/**
 * The geometry of the playfield, once it is settled for the mode on screen.
 *
 * The editor and playtest draw the same canvas at different sizes, speeds and
 * hit line heights, and each keeps its own numbers: the editor's live in
 * AppSettings, playtest's in PlaytestSettings under different names. Resolving
 * them here means the canvas is handed one shape rather than deciding per
 * field which store it is reading, and there is one place to look when the two
 * modes disagree about geometry.
 */
export type PlayfieldLayout = {
  /** Multiplier on the playfield's drawn width. */
  scale: number;
  /**
   * Pixels the judgement line sits further from the scroll edge than
   * PLAYHEAD_FROM_EDGE. Both modes can move it, each from its own store.
   */
  hitPosition: number;
  /** How fast notes travel, in the editor's own scroll-speed units. */
  scrollSpeed: number;
  noteHeightScale: number;
  longNoteBodyScale: number;
  /** How far the background is dimmed behind the playfield, 0 to 100. */
  backgroundDim: number;
};

/**
 * Playtest's geometry read as overrides on the editor's.
 *
 * Only the fields playtest actually stores separately appear here: note and
 * long note scaling stay the editor's in both modes, because a playtest is
 * meant to show the map at the size it is being mapped at.
 */
function playtestOverride(
  playtest: PlaytestSettings,
  rate: number,
): Partial<PlayfieldLayout> {
  return {
    scale: playtest.zoom,
    hitPosition: playtest.hitPosition,
    // Scroll speed is how fast notes move in real time, so a faster rate does
    // not make them race (osu! multiplies its time range by the rate).
    scrollSpeed: playtest.scrollSpeed / rate,
    backgroundDim: playtest.backgroundDim,
  };
}

export function resolvePlayfieldLayout({
  settings,
  view,
  playtest,
  playtestActive,
  rate,
}: {
  settings: AppSettings;
  view: ViewState;
  playtest: PlaytestSettings;
  playtestActive: boolean;
  rate: number;
}): PlayfieldLayout {
  const base: PlayfieldLayout = {
    scale: settings.playfieldScale,
    hitPosition: settings.playfieldHitPosition,
    scrollSpeed: view.scrollSpeed,
    noteHeightScale: settings.noteHeightScale,
    longNoteBodyScale: settings.longNoteBodyScale,
    backgroundDim: settings.dimBackground,
  };
  return playtestActive
    ? { ...base, ...playtestOverride(playtest, rate) }
    : base;
}
