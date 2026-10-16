/** What the playfield showed on its last frame, all in map time. */
export type EditorViewport = {
  /** Earliest and latest time on screen, whichever way the field scrolls. */
  from: number;
  to: number;
  /** The time at the judgement line, as drawn (smooth scrolling included). */
  time: number;
};

/**
 * Carries the playfield's visible range to views outside it, such as the map
 * overview, without a React render per frame. The editor writes it while it
 * draws and listeners hear about it in that same frame, so the two never
 * disagree. Nothing listens unless such a view is open.
 */
export type EditorViewportChannel = {
  current: EditorViewport | null;
  listeners: Set<() => void>;
};

export function createEditorViewportChannel(): EditorViewportChannel {
  return { current: null, listeners: new Set() };
}

export function publishEditorViewport(
  channel: EditorViewportChannel,
  from: number,
  to: number,
  time: number,
): void {
  if (!Number.isFinite(from) || !Number.isFinite(to) || !Number.isFinite(time)) {
    return;
  }
  const last = channel.current;
  if (last && last.from === from && last.to === to && last.time === time) return;
  // Written in place: during playback this runs every frame.
  if (last) {
    last.from = from;
    last.to = to;
    last.time = time;
  } else {
    channel.current = { from, to, time };
  }
  for (const listener of channel.listeners) listener();
}

export function subscribeEditorViewport(
  channel: EditorViewportChannel,
  listener: () => void,
): () => void {
  channel.listeners.add(listener);
  return () => {
    channel.listeners.delete(listener);
  };
}
