import { useEffect, useMemo, useRef, useState } from "react";
import type { PlaytestKeybinds } from "../lib/playtestKeybinds";

export function usePlaytestInput({
  active,
  paused,
  keyCount,
  keybinds,
  quickRestartCode,
  onPress,
  onRelease,
  onPause,
  onRestart,
}: {
  active: boolean;
  /** Paused (pause menu open): swallow lane input, but keep Esc / quick-restart. */
  paused: boolean;
  keyCount: number;
  keybinds: PlaytestKeybinds;
  /** KeyboardEvent.code that instantly restarts the run ("" disables it). */
  quickRestartCode: string;
  onPress: (column: number) => void;
  onRelease: (column: number) => void;
  /** Escape: toggle the pause menu. */
  onPause: () => void;
  onRestart: () => void;
}) {
  const [heldCodes, setHeldCodes] = useState<Set<string>>(() => new Set());
  // Source-of-truth for which keys are down, mutated synchronously in the event
  // handlers. `heldCodes` state just mirrors it for the on-screen key display.
  const heldRef = useRef<Set<string>>(new Set());

  const codeToColumn = useMemo(() => {
    const map = new Map<string, number>();
    const keys = keybinds[keyCount] ?? [];
    keys.forEach((code, column) => {
      if (code && !map.has(code)) map.set(code, column);
    });
    return map;
  }, [keybinds, keyCount]);

  // The callbacks (and `paused`) change identity on most renders because they
  // close over the live audio clock. Keep them in a ref so the listener effect
  // can depend only on stable values and subscribe once per run.
  const handlers = useRef({ onPress, onRelease, onPause, onRestart, paused });
  handlers.current = { onPress, onRelease, onPause, onRestart, paused };

  const syncHeld = () => setHeldCodes(new Set(heldRef.current));

  useEffect(() => {
    if (!active) {
      if (heldRef.current.size) {
        heldRef.current = new Set();
        setHeldCodes((prev) => (prev.size ? new Set() : prev));
      }
      return;
    }

    const down = (e: KeyboardEvent) => {
      const h = handlers.current;
      // Escape opens / closes the pause menu — works whether or not we're paused.
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        h.onPause();
        return;
      }
      // The configurable quick-restart key restarts instantly, including from
      // the pause menu.
      if (quickRestartCode && e.code === quickRestartCode) {
        e.preventDefault();
        e.stopImmediatePropagation();
        h.onRestart();
        return;
      }

      const column = codeToColumn.get(e.code);
      if (column === undefined) return;
      // Swallow mapped keys even while paused so they don't scroll/scrub behind
      // the menu, but don't let them register as hits.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (h.paused || e.repeat || heldRef.current.has(e.code)) return;
      heldRef.current.add(e.code);
      syncHeld();
      // Called OUTSIDE any setState updater — onPress itself calls setState, and
      // doing that from inside an updater (under StrictMode) drops the update.
      h.onPress(column);
    };

    const up = (e: KeyboardEvent) => {
      const h = handlers.current;
      const column = codeToColumn.get(e.code);
      if (column === undefined) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!heldRef.current.has(e.code)) return;
      heldRef.current.delete(e.code);
      syncHeld();
      if (!h.paused) h.onRelease(column);
    };

    const blur = () => {
      if (!heldRef.current.size) return;
      heldRef.current = new Set();
      setHeldCodes(new Set());
    };

    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, [active, codeToColumn, quickRestartCode]);

  return heldCodes;
}
