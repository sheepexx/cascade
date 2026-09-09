export type DesktopHintState = {
  shows: number;
  lastShownAt: number;
  dismissed: boolean;
};

export const DESKTOP_HINT_MAX_SHOWS = 3;
export const DESKTOP_HINT_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
export const DESKTOP_HINT_DELAY_MS = 1400;
export const DESKTOP_HINT_VISIBLE_MS = 22000;

const HINT_KEY = "mania-editor:desktop-hint";

export const EMPTY_DESKTOP_HINT: DesktopHintState = {
  shows: 0,
  lastShownAt: 0,
  dismissed: false,
};

export function shouldShowDesktopHint(
  state: DesktopHintState,
  now: number,
): boolean {
  if (state.dismissed) return false;
  if (state.shows >= DESKTOP_HINT_MAX_SHOWS) return false;
  if (state.shows > 0 && now - state.lastShownAt < DESKTOP_HINT_COOLDOWN_MS) {
    return false;
  }
  return true;
}

export function recordDesktopHintShown(
  state: DesktopHintState,
  now: number,
): DesktopHintState {
  return { ...state, shows: state.shows + 1, lastShownAt: now };
}

export function dismissDesktopHint(state: DesktopHintState): DesktopHintState {
  return { ...state, dismissed: true };
}

export function loadDesktopHintState(): DesktopHintState {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    if (!raw) return EMPTY_DESKTOP_HINT;
    const parsed = JSON.parse(raw) as Partial<DesktopHintState>;
    return {
      shows: Number.isFinite(parsed.shows) ? Number(parsed.shows) : 0,
      lastShownAt: Number.isFinite(parsed.lastShownAt)
        ? Number(parsed.lastShownAt)
        : 0,
      dismissed: parsed.dismissed === true,
    };
  } catch {
    return EMPTY_DESKTOP_HINT;
  }
}

export function saveDesktopHintState(state: DesktopHintState): void {
  try {
    localStorage.setItem(HINT_KEY, JSON.stringify(state));
  } catch {
  }
}
