import { describe, expect, it } from "vitest";
import {
  DESKTOP_HINT_COOLDOWN_MS,
  DESKTOP_HINT_MAX_SHOWS,
  EMPTY_DESKTOP_HINT,
  dismissDesktopHint,
  recordDesktopHintShown,
  shouldShowDesktopHint,
} from "./desktopHint";

const NOW = 1_700_000_000_000;

describe("shouldShowDesktopHint", () => {
  it("shows to someone who has never seen it", () => {
    expect(shouldShowDesktopHint(EMPTY_DESKTOP_HINT, NOW)).toBe(true);
  });

  it("stays quiet for the rest of the cooldown", () => {
    const seen = recordDesktopHintShown(EMPTY_DESKTOP_HINT, NOW);
    expect(shouldShowDesktopHint(seen, NOW + 1000)).toBe(false);
    expect(
      shouldShowDesktopHint(seen, NOW + DESKTOP_HINT_COOLDOWN_MS - 1),
    ).toBe(false);
  });

  it("comes back once the cooldown is over", () => {
    const seen = recordDesktopHintShown(EMPTY_DESKTOP_HINT, NOW);
    expect(shouldShowDesktopHint(seen, NOW + DESKTOP_HINT_COOLDOWN_MS)).toBe(
      true,
    );
  });

  it("gives up after the show limit", () => {
    let state = EMPTY_DESKTOP_HINT;
    let at = NOW;
    for (let i = 0; i < DESKTOP_HINT_MAX_SHOWS; i++) {
      expect(shouldShowDesktopHint(state, at)).toBe(true);
      state = recordDesktopHintShown(state, at);
      at += DESKTOP_HINT_COOLDOWN_MS;
    }
    expect(state.shows).toBe(DESKTOP_HINT_MAX_SHOWS);
    expect(shouldShowDesktopHint(state, at)).toBe(false);
  });

  it("never comes back after a dismissal", () => {
    const state = dismissDesktopHint(EMPTY_DESKTOP_HINT);
    expect(shouldShowDesktopHint(state, NOW + DESKTOP_HINT_COOLDOWN_MS * 10)).toBe(
      false,
    );
  });

  it("does not fire early when the clock jumps backwards", () => {
    const seen = recordDesktopHintShown(EMPTY_DESKTOP_HINT, NOW);
    expect(shouldShowDesktopHint(seen, NOW - DESKTOP_HINT_COOLDOWN_MS)).toBe(
      false,
    );
  });
});
