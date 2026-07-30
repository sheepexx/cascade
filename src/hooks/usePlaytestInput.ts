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
  onToggleAutoplay,
}: {
  active: boolean;
  paused: boolean;
  keyCount: number;
  keybinds: PlaytestKeybinds;
  quickRestartCode: string;
  onPress: (column: number) => void;
  onRelease: (column: number) => void;
  onPause: () => void;
  onRestart: () => void;
  onToggleAutoplay: () => void;
}) {
  const [heldCodes, setHeldCodes] = useState<Set<string>>(() => new Set());
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
    paused,
  });
  handlers.current = {
    onPress,
    onRelease,
    onPause,
    onRestart,
    onToggleAutoplay,
    paused,
  };

  const syncHeld = () => setHeldCodes(new Set(heldRef.current));

  useEffect(() => {
    if (!active) {
      if (heldRef.current.size) {
        heldRef.current = new Set();
        pressedColumnsRef.current = new Set();
        setHeldCodes((prev) => (prev.size ? new Set() : prev));
      }
      return;
    }

    const down = (e: KeyboardEvent) => {
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
      if (column === undefined) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (h.paused || e.repeat || heldRef.current.has(e.code)) return;
      heldRef.current.add(e.code);
      pressedColumnsRef.current.add(column);
      syncHeld();
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
      let stillHeld = false;
      for (const code of heldRef.current) {
        if (codeToColumn.get(code) === column) {
          stillHeld = true;
          break;
        }
      }
      if (!stillHeld) pressedColumnsRef.current.delete(column);
      syncHeld();
      if (!h.paused) h.onRelease(column);
    };

    const blur = () => {
      if (!heldRef.current.size) return;
      heldRef.current = new Set();
      pressedColumnsRef.current = new Set();
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

  return { heldCodes, pressedColumnsRef };
}
