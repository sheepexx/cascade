import { useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { AudioSeekTransition } from "../lib/audioSeek";
import {
  bookmarkInDirection,
  bookmarkKey,
  loopAroundTime,
  sortedBookmarks,
} from "../lib/bookmarks";
import type { DiffFieldOp } from "../lib/ops";
import type { Difficulty } from "../types";
import type { BookmarkLoopState } from "./appTypes";

/**
 * Edits made on the bottom timeline: named bookmarks and jumping between
 * them, the loop between two bookmarks, and the trim brackets and fades.
 * Trim and fade drags go through commitDiffFields, which throttles what a
 * live session broadcasts while the bracket moves.
 */
export function useTimelineEdits({
  activeIdRef,
  canEditRef,
  commitDiffFields,
  currentTimeRef,
  difficultiesRef,
  durationRef,
  markStructural,
  seekAudio,
  setBookmarkLoop,
  setDifficulties,
}: {
  activeIdRef: MutableRefObject<string>;
  canEditRef: MutableRefObject<boolean>;
  commitDiffFields: (fields: Partial<Record<keyof DiffFieldOp["fields"], number | null>>) => void;
  currentTimeRef: MutableRefObject<number>;
  difficultiesRef: MutableRefObject<Difficulty[]>;
  durationRef: MutableRefObject<number>;
  markStructural: () => void;
  seekAudio: (time: number, transition?: AudioSeekTransition) => void;
  setBookmarkLoop: Dispatch<SetStateAction<BookmarkLoopState | null>>;
  setDifficulties: Dispatch<SetStateAction<Difficulty[]>>;
}) {
  const addBookmark = useCallback(
    (ms: number, label?: string) => {
      if (!canEditRef.current) return;
      const t = Math.round(ms);
      if (!(t >= 0)) return;
      const name = label?.trim().slice(0, 80) ?? "";
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          const existing = d.bookmarks ?? [];
          const nearby = existing.find((b) => Math.abs(b - t) <= 5);
          if (nearby !== undefined && !name) return d;
          const time = nearby ?? t;
          const nextBookmarks = nearby
            ? existing
            : [...existing, time].sort((a, b) => a - b);
          const nextLabels = { ...(d.bookmarkLabels ?? {}) };
          if (name) nextLabels[bookmarkKey(time)] = name;
          return {
            ...d,
            bookmarks: nextBookmarks,
            bookmarkLabels: Object.keys(nextLabels).length
              ? nextLabels
              : undefined,
          };
        }),
      );
    },
    [markStructural, canEditRef, activeIdRef, setDifficulties],
  );

  const renameBookmark = useCallback(
    (ms: number, label: string) => {
      if (!canEditRef.current) return;
      const name = label.trim().slice(0, 80);
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current || !d.bookmarks?.includes(ms)) return d;
          const labels = { ...(d.bookmarkLabels ?? {}) };
          if (name) labels[bookmarkKey(ms)] = name;
          else delete labels[bookmarkKey(ms)];
          return {
            ...d,
            bookmarkLabels: Object.keys(labels).length ? labels : undefined,
          };
        }),
      );
    },
    [markStructural, canEditRef, activeIdRef, setDifficulties],
  );

  const removeBookmark = useCallback(
    (ms: number) => {
      if (!canEditRef.current) return;
      markStructural();
      setDifficulties((prev) =>
        prev.map((d) => {
          if (d.id !== activeIdRef.current) return d;
          const existing = d.bookmarks ?? [];
          const next = existing.filter((b) => b !== ms);
          if (next.length === existing.length) return d;
          const labels = { ...(d.bookmarkLabels ?? {}) };
          delete labels[bookmarkKey(ms)];
          return {
            ...d,
            bookmarks: next.length ? next : undefined,
            bookmarkLabels: Object.keys(labels).length ? labels : undefined,
          };
        }),
      );
      setBookmarkLoop((loop) =>
        loop?.diffId === activeIdRef.current &&
        (loop.startMs === ms || loop.endMs === ms)
          ? null
          : loop,
      );
    },
    [markStructural, canEditRef, activeIdRef, setBookmarkLoop, setDifficulties],
  );

  const seekBookmark = useCallback(
    (direction: "previous" | "next") => {
      const d = difficultiesRef.current.find(
        (item) => item.id === activeIdRef.current,
      );
      const target = bookmarkInDirection(
        d?.bookmarks,
        currentTimeRef.current,
        direction,
      );
      if (target !== null) seekAudio(target, "smooth");
    },
    [seekAudio, activeIdRef, currentTimeRef, difficultiesRef],
  );
  const seekPreviousBookmark = useCallback(
    () => seekBookmark("previous"),
    [seekBookmark],
  );
  const seekNextBookmark = useCallback(
    () => seekBookmark("next"),
    [seekBookmark],
  );

  const setBookmarkLoopStart = useCallback((ms: number) => {
    const d = difficultiesRef.current.find(
      (item) => item.id === activeIdRef.current,
    );
    const after = sortedBookmarks(d?.bookmarks).find((value) => value > ms);
    setBookmarkLoop((loop) => {
      const end =
        loop?.diffId === activeIdRef.current && loop.endMs > ms
          ? loop.endMs
          : after;
      if (end === undefined) return loop;
      return {
        diffId: activeIdRef.current,
        startMs: ms,
        endMs: end,
        enabled: loop?.diffId === activeIdRef.current && loop.enabled,
      };
    });
  }, [activeIdRef, difficultiesRef, setBookmarkLoop]);

  const setBookmarkLoopEnd = useCallback((ms: number) => {
    const d = difficultiesRef.current.find(
      (item) => item.id === activeIdRef.current,
    );
    const prior = sortedBookmarks(d?.bookmarks).filter((value) => value < ms);
    const before = prior[prior.length - 1];
    setBookmarkLoop((loop) => {
      const start =
        loop?.diffId === activeIdRef.current && loop.startMs < ms
          ? loop.startMs
          : before;
      if (start === undefined) return loop;
      return {
        diffId: activeIdRef.current,
        startMs: start,
        endMs: ms,
        enabled: loop?.diffId === activeIdRef.current && loop.enabled,
      };
    });
  }, [activeIdRef, difficultiesRef, setBookmarkLoop]);

  const toggleBookmarkLoop = useCallback(() => {
    setBookmarkLoop((loop) => {
      if (loop?.diffId === activeIdRef.current) {
        return { ...loop, enabled: !loop.enabled };
      }
      const d = difficultiesRef.current.find(
        (item) => item.id === activeIdRef.current,
      );
      const range = loopAroundTime(d?.bookmarks, currentTimeRef.current);
      return range
        ? { diffId: activeIdRef.current, ...range, enabled: true }
        : loop;
    });
  }, [activeIdRef, currentTimeRef, difficultiesRef, setBookmarkLoop]);

  const clearBookmarkLoop = useCallback(() => {
    setBookmarkLoop((loop) =>
      loop?.diffId === activeIdRef.current ? null : loop,
    );
  }, [activeIdRef, setBookmarkLoop]);

  const setTrimStart = useCallback(
    (ms: number) => {
      const d = difficultiesRef.current.find(
        (x) => x.id === activeIdRef.current,
      );
      if (!d) return;
      const end = d.trimEndMs ?? durationRef.current;
      const t = Math.round(Math.max(0, Math.min(ms, end - 10)));
      commitDiffFields({ trimStartMs: t <= 0 ? null : t });
    },
    [commitDiffFields, activeIdRef, difficultiesRef, durationRef],
  );

  const setTrimEnd = useCallback(
    (ms: number) => {
      const d = difficultiesRef.current.find(
        (x) => x.id === activeIdRef.current,
      );
      if (!d) return;
      const dur = durationRef.current;
      const start = d.trimStartMs ?? 0;
      const t = Math.round(Math.max(start + 10, Math.min(ms, dur)));
      commitDiffFields({ trimEndMs: t >= dur - 0.5 ? null : t });
    },
    [commitDiffFields, activeIdRef, difficultiesRef, durationRef],
  );

  const setFadeIn = useCallback(
    (ms: number) => {
      const d = difficultiesRef.current.find(
        (x) => x.id === activeIdRef.current,
      );
      if (!d) return;
      const start = d.trimStartMs ?? 0;
      const end = d.trimEndMs ?? durationRef.current;
      const max = Math.max(0, end - start);
      const t = Math.round(Math.max(0, Math.min(ms, max)));
      commitDiffFields({ fadeInMs: t <= 0 ? null : t });
    },
    [commitDiffFields, activeIdRef, difficultiesRef, durationRef],
  );

  const setFadeOut = useCallback(
    (ms: number) => {
      const d = difficultiesRef.current.find(
        (x) => x.id === activeIdRef.current,
      );
      if (!d) return;
      const start = d.trimStartMs ?? 0;
      const end = d.trimEndMs ?? durationRef.current;
      const max = Math.max(0, end - start);
      const t = Math.round(Math.max(0, Math.min(ms, max)));
      commitDiffFields({ fadeOutMs: t <= 0 ? null : t });
    },
    [commitDiffFields, activeIdRef, difficultiesRef, durationRef],
  );

  return {
    addBookmark,
    clearBookmarkLoop,
    removeBookmark,
    renameBookmark,
    seekBookmark,
    seekNextBookmark,
    seekPreviousBookmark,
    setBookmarkLoopEnd,
    setBookmarkLoopStart,
    setFadeIn,
    setFadeOut,
    setTrimEnd,
    setTrimStart,
    toggleBookmarkLoop,
  };
}
