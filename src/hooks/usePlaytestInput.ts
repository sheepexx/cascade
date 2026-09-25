import { useEffect, useMemo, useRef, useState } from "react";

/**
 * The keys held down, for the key overlay. Kept out of React state so a key
 * press does not re-render the editor that owns this hook; the overlay
 * subscribes on its own.
 */
export type HeldKeysStore = {
  subscribe(listener: () => void): () => void;
  getSnapshot(): ReadonlySet<string>;
};

function createHeldKeysStore(): HeldKeysStore & { set(next: ReadonlySet<string>): void } {
  let held: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => held,
    set(next) {
      if (next.size === 0 && held.size === 0) return;
      held = next;
      for (const listener of listeners) listener();
    },
  };
}
import type { PlaytestKeybinds } from "../lib/playtestKeybinds";

export function isPlaytestTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  const tag = element?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    !!element?.isContentEditable
  );
}

export function usePlaytestInput({
  active,
  paused,
  keyCount,
  keybinds,
  quickRestartCode,
  scrollSpeedDownCode = "",
  scrollSpeedUpCode = "",
  onPress,
  onRelease,
  onPause,
  onRestart,
  onToggleAutoplay,
  onScrollSpeed,
}: {
  active: boolean;
  paused: boolean;
  keyCount: number;
  keybinds: PlaytestKeybinds;
  quickRestartCode: string;
  /** osu!'s in-game scroll speed keys (F3 and F4 by default). */
  scrollSpeedDownCode?: string;
  scrollSpeedUpCode?: string;
  /**
   * `stamp` is the event's timeStamp: when the browser saw the key, which can
   * be a frame or more before this handler gets to run.
   */
  onPress: (column: number, stamp: number) => void;
  onRelease: (column: number, stamp: number) => void;
  onPause: () => void;
  onRestart: () => void;
  onToggleAutoplay: () => void;
  onScrollSpeed?: (direction: 1 | -1) => void;
}) {
  const [heldKeys] = useState(createHeldKeysStore);
  const heldRef = useRef<Set<string>>(new Set());
  const pressedColumnsRef = useRef<Set<number>>(new Set());

  const codeToColumn = useMemo(() => {
    const map = new Map<string, number>();
    const keys = keybinds[keyCount] ?? [];
    keys.forEach((code, column) => {
      if (code && !map.has(code)) map.set(code, column);
    });
    return map;
  }, [keybinds, keyCount]);

  const handlers = useRef({
    onPress,
    onRelease,
    onPause,
    onRestart,
    onToggleAutoplay,
    onScrollSpeed,
    paused,
  });
  handlers.current = {
    onPress,
    onRelease,
    onPause,
    onRestart,
    onToggleAutoplay,
    onScrollSpeed,
    paused,
  };


  useEffect(() => {
    if (!active) {
      if (heldRef.current.size) {
        heldRef.current = new Set();
        pressedColumnsRef.current = new Set();
        heldKeys.set(new Set());
      }
      return;
    }

    const down = (e: KeyboardEvent) => {
      if (isPlaytestTypingTarget(e.target)) return;
      const h = handlers.current;
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        h.onPause();
        return;
      }
      if (quickRestartCode && e.code === quickRestartCode) {
        e.preventDefault();
        e.stopImmediatePropagation();
        h.onRestart();
        return;
      }
      if (e.code === "Tab") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!e.repeat) h.onToggleAutoplay();
        return;
      }

      const column = codeToColumn.get(e.code);
      const speed =
        column !== undefined
          ? 0
          : e.code === scrollSpeedUpCode
            ? 1
            : e.code === scrollSpeedDownCode
              ? -1
              : 0;
      if (speed !== 0 && h.onScrollSpeed) {
        e.preventDefault();
        e.stopImmediatePropagation();
        h.onScrollSpeed(speed);
        return;
      }
      if (column === undefined) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (h.paused || e.repeat || heldRef.current.has(e.code)) return;
      heldRef.current.add(e.code);
      pressedColumnsRef.current.add(column);
      h.onPress(column, e.timeStamp);
      heldKeys.set(new Set(heldRef.current));
    };

    const up = (e: KeyboardEvent) => {
      if (
        isPlaytestTypingTarget(e.target) &&
        !heldRef.current.has(e.code)
      ) {
        return;
      }
      const h = handlers.current;
      const column = codeToColumn.get(e.code);
      if (column === undefined) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!heldRef.current.has(e.code)) return;
      heldRef.current.delete(e.code);
      let stillHeld = false;
      for (const code of heldRef.current) {
        if (codeToColumn.get(code) === column) {
          stillHeld = true;
          break;
        }
      }
      if (!stillHeld) pressedColumnsRef.current.delete(column);
      if (!h.paused) h.onRelease(column, e.timeStamp);
      heldKeys.set(new Set(heldRef.current));
    };

    const blur = () => {
      if (!heldRef.current.size) return;
      heldRef.current = new Set();
      pressedColumnsRef.current = new Set();
      heldKeys.set(new Set());
    };

    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, [active, codeToColumn, heldKeys, quickRestartCode, scrollSpeedDownCode, scrollSpeedUpCode]);

  return { heldKeys: heldKeys as HeldKeysStore, pressedColumnsRef };
}
