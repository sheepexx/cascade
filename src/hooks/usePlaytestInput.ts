import { useEffect, useMemo, useState } from "react";
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

  const codeToColumn = useMemo(() => {
    const map = new Map<string, number>();
    const keys = keybinds[keyCount] ?? [];
    keys.forEach((code, column) => {
      if (code && !map.has(code)) map.set(code, column);
    });
    return map;
  }, [keybinds, keyCount]);

  useEffect(() => {
    if (!active) {
      setHeldCodes(new Set());
      return;
    }

    const down = (e: KeyboardEvent) => {
      // Escape opens / closes the pause menu — works whether or not we're paused.
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        onPause();
        return;
      }
      // The configurable quick-restart key restarts instantly, including from
      // the pause menu.
      if (quickRestartCode && e.code === quickRestartCode) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onRestart();
        return;
      }

      const column = codeToColumn.get(e.code);
      if (column === undefined) return;
      // Swallow mapped keys even while paused so they don't scroll/scrub behind
      // the menu, but don't let them register as hits.
      e.preventDefault();
      e.stopImmediatePropagation();
      if (paused || e.repeat) return;

      setHeldCodes((prev) => {
        if (prev.has(e.code)) return prev;
        const next = new Set(prev);
        next.add(e.code);
        onPress(column);
        return next;
      });
    };

    const up = (e: KeyboardEvent) => {
      const column = codeToColumn.get(e.code);
      if (column === undefined) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (paused) return;
      setHeldCodes((prev) => {
        if (!prev.has(e.code)) return prev;
        const next = new Set(prev);
        next.delete(e.code);
        onRelease(column);
        return next;
      });
    };

    const blur = () => {
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
  }, [
    active,
    paused,
    codeToColumn,
    quickRestartCode,
    onPause,
    onPress,
    onRelease,
    onRestart,
  ]);

  return heldCodes;
}
