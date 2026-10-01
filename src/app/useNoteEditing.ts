import { useCallback, useMemo } from "react";
import type { MutableRefObject } from "react";
import type { Translate } from "../lib/i18n";
import {
  hasNoteCollisions,
  placementFor,
  sameNoteGeometry,
  withoutNoteCollisions,
} from "../lib/noteCollision";
import {
  copyHitsounds,
  countHitsounds,
  dropShortLongNotes,
  fullLongNotes,
  fullLongNotesWithin,
  fullRiceNotes,
  fullRiceNotesWithin,
  shiftLongNoteEnds,
} from "../lib/noteTools";
import type { NoteOp } from "../lib/ops";
import type { OsdNotice } from "../lib/osd";
import type { Difficulty, ManiaNote, TimingPoint, ViewState } from "../types";

/**
 * Note edits on the open difficulty: placing, deleting, moving and pasting
 * notes, the Full LN and Full RC tools and their selection-scoped forms,
 * long note end shifts, crop to the trim brackets, and copying hitsounds
 * between difficulties. Each one is a single undoable op through commitNoteOp.
 */
export function useNoteEditing({
  active,
  activeId,
  activeIdRef,
  announceShortcut,
  commitNoteOp,
  difficulties,
  difficultiesRef,
  selectionRange,
  t,
  timingPointsRef,
  view,
}: {
  active: Difficulty;
  activeId: string;
  activeIdRef: MutableRefObject<string>;
  announceShortcut: (notice: OsdNotice | string) => void;
  commitNoteOp: (op: NoteOp) => void;
  difficulties: Difficulty[];
  difficultiesRef: MutableRefObject<Difficulty[]>;
  selectionRange: { start: number; end: number; count: number; ids: ReadonlySet<string>; } | null;
  t: Translate;
  timingPointsRef: MutableRefObject<TimingPoint[]>;
  view: ViewState;
}) {
  const placeNote = useCallback(
    (note: ManiaNote) => {
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const placement = placementFor(note, target.notes);
      if (placement.kind === "blocked") return;
      if (placement.kind === "replace") {
        // Keeping the replaced note's id makes the swap a single edit, so one
        // undo brings the old note back.
        const { replaced } = placement;
        commitNoteOp({
          t: "note.update",
          diffId: did,
          before: [replaced],
          after: [{ ...note, id: replaced.id }],
        });
        return;
      }
      commitNoteOp({ t: "note.add", diffId: did, notes: [note] });
    },
    [commitNoteOp, activeIdRef, difficultiesRef],
  );

  const deleteNote = useCallback(
    (noteId: string) => {
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      const note = target?.notes.find((n) => n.id === noteId);
      if (!note) return;
      commitNoteOp({ t: "note.remove", diffId: did, notes: [note] });
    },
    [commitNoteOp, activeIdRef, difficultiesRef],
  );

  const addNotes = useCallback(
    (notes: ManiaNote[]) => {
      if (!notes.length) return;
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const accepted = withoutNoteCollisions(notes, target.notes);
      if (!accepted.length) return;
      commitNoteOp({ t: "note.add", diffId: did, notes: accepted });
    },
    [commitNoteOp, activeIdRef, difficultiesRef],
  );

  const deleteNotes = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      const set = new Set(ids);
      const removed = target ? target.notes.filter((n) => set.has(n.id)) : [];
      if (!removed.length) return;
      commitNoteOp({ t: "note.remove", diffId: did, notes: removed });
    },
    [commitNoteOp, activeIdRef, difficultiesRef],
  );

  const applyFullLong = useCallback(
    (ticks: number) => {
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const points = target.timingPoints?.length
        ? target.timingPoints
        : timingPointsRef.current;
      const after = fullLongNotes(target.notes, points, view.snapDivisor, ticks);
      if (hasNoteCollisions(after)) return;
      commitNoteOp({
        t: "note.update",
        diffId: did,
        before: target.notes,
        after,
      });
    },
    [commitNoteOp, view.snapDivisor, activeIdRef, difficultiesRef, timingPointsRef],
  );

  const applyFullRice = useCallback(() => {
    const did = activeIdRef.current;
    const target = difficultiesRef.current.find((d) => d.id === did);
    if (!target) return;
    const after = fullRiceNotes(target.notes);
    if (hasNoteCollisions(after)) return;
    commitNoteOp({
      t: "note.update",
      diffId: did,
      before: target.notes,
      after,
    });
  }, [commitNoteOp, activeIdRef, difficultiesRef]);

  /**
   * The selection-scoped note tools. Each takes the ids the editor reports and
   * commits one undoable update, the same way the difficulty-wide tools do.
   */
  const commitSelectionEdit = useCallback(
    (edit: (notes: ManiaNote[], ids: ReadonlySet<string>) => ManiaNote[]) => {
      const ids = selectionRange?.ids;
      if (!ids?.size) return;
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const after = edit(target.notes, ids);
      if (after === target.notes || hasNoteCollisions(after)) return;
      commitNoteOp({
        t: "note.update",
        diffId: did,
        before: target.notes,
        after,
      });
    },
    [commitNoteOp, selectionRange, activeIdRef, difficultiesRef],
  );

  const applySelectionLong = useCallback(
    (ticks: number) =>
      commitSelectionEdit((notes, ids) => {
        const target = difficultiesRef.current.find(
          (d) => d.id === activeIdRef.current,
        );
        const points = target?.timingPoints?.length
          ? target.timingPoints
          : timingPointsRef.current;
        return fullLongNotesWithin(notes, ids, points, view.snapDivisor, ticks);
      }),
    [commitSelectionEdit, view.snapDivisor, activeIdRef, difficultiesRef, timingPointsRef],
  );

  const applySelectionRice = useCallback(
    () => commitSelectionEdit((notes, ids) => fullRiceNotesWithin(notes, ids)),
    [commitSelectionEdit],
  );

  const applyShiftLnEnds = useCallback(
    (deltaMs: number) =>
      commitSelectionEdit((notes, ids) =>
        shiftLongNoteEnds(notes, ids, deltaMs),
      ),
    [commitSelectionEdit],
  );

  const applyDropShortLns = useCallback(
    (minMs: number) =>
      commitSelectionEdit((notes, ids) =>
        dropShortLongNotes(notes, ids, minMs),
      ),
    [commitSelectionEdit],
  );

  const applyCopyHitsounds = useCallback(
    (sourceId: string) => {
      const did = activeIdRef.current;
      if (sourceId === did) return;
      const diffs = difficultiesRef.current;
      const target = diffs.find((d) => d.id === did);
      const source = diffs.find((d) => d.id === sourceId);
      if (!target || !source) return;
      const { before, after } = copyHitsounds(target.notes, source.notes);
      const name = source.name || t("hitsounds.unnamed");
      if (after.length === 0) {
        announceShortcut(t("hitsounds.nothingNewFrom", { name }));
        return;
      }
      commitNoteOp({ t: "note.update", diffId: did, before, after });
      announceShortcut(
        t("hitsounds.copiedFrom", {
          name,
          notes: t("hitsounds.noteCount", { count: after.length }),
        }),
      );
    },
    [commitNoteOp, announceShortcut, t, activeIdRef, difficultiesRef],
  );

  // Rate-changed difficulties sit on a stretched copy of the song, so only
  // difficulties on the same audio line up note for note.
  const hitsoundTargets = useMemo(
    () =>
      difficulties.filter(
        (d) =>
          d.id !== activeId &&
          (d.audioFilename ?? "") === (active.audioFilename ?? ""),
      ),
    [difficulties, activeId, active.audioFilename],
  );

  const applyCopyHitsoundsToAll = useCallback(() => {
    const did = activeIdRef.current;
    const diffs = difficultiesRef.current;
    const source = diffs.find((d) => d.id === did);
    if (!source) return;
    let changedNotes = 0;
    let changedDiffs = 0;
    for (const target of diffs) {
      if (target.id === did) continue;
      if ((target.audioFilename ?? "") !== (source.audioFilename ?? "")) continue;
      const { before, after } = copyHitsounds(target.notes, source.notes);
      if (after.length === 0) continue;
      commitNoteOp({ t: "note.update", diffId: target.id, before, after });
      changedNotes += after.length;
      changedDiffs += 1;
    }
    announceShortcut(
      changedNotes
        ? t("hitsounds.copiedToAll", {
            notes: t("hitsounds.noteCount", { count: changedNotes }),
            difficulties: t("hitsounds.difficultyCount", { count: changedDiffs }),
          })
        : t("hitsounds.allMatch"),
    );
  }, [commitNoteOp, announceShortcut, t, activeIdRef, difficultiesRef]);

  const hitsoundSources = useMemo(
    () =>
      difficulties
        .filter((d) => d.id !== activeId)
        .map((d) => ({
          id: d.id,
          name: d.name || "(unnamed)",
          noteCount: d.notes.length,
          hitsoundCount: countHitsounds(d.notes),
        })),
    [difficulties, activeId],
  );

  const applyCropToBrackets = useCallback(() => {
    const did = activeIdRef.current;
    const target = difficultiesRef.current.find((d) => d.id === did);
    if (!target) return;
    const start = target.trimStartMs ?? 0;
    const hasEnd = target.trimEndMs !== undefined;
    const end = target.trimEndMs ?? Infinity;
    if (start <= 0.5 && !hasEnd) return;

    const toRemove: ManiaNote[] = [];
    const clampBefore: ManiaNote[] = [];
    const clampAfter: ManiaNote[] = [];
    for (const n of target.notes) {
      if (n.startTime < start - 0.5 || n.startTime > end + 0.5) {
        toRemove.push(n);
      } else if (hasEnd && n.endTime !== undefined && n.endTime > end + 0.5) {
        clampBefore.push(n);
        clampAfter.push(
          end > n.startTime
            ? { ...n, endTime: Math.round(end) }
            : { ...n, endTime: undefined },
        );
      }
    }
    if (toRemove.length) {
      commitNoteOp({ t: "note.remove", diffId: did, notes: toRemove });
    }
    if (clampAfter.length) {
      commitNoteOp({
        t: "note.update",
        diffId: did,
        before: clampBefore,
        after: clampAfter,
      });
    }
  }, [commitNoteOp, activeIdRef, difficultiesRef]);

  const moveNotes = useCallback(
    (updated: ManiaNote[]) => {
      if (!updated.length) return;
      const did = activeIdRef.current;
      const target = difficultiesRef.current.find((d) => d.id === did);
      if (!target) return;
      const byId = new Map(updated.map((n) => [n.id, n]));
      const before = target.notes.filter((n) => byId.has(n.id));
      if (!before.length) return;
      const beforeById = new Map(before.map((n) => [n.id, n]));
      const changedGeometry = updated.some((n) => {
        const old = beforeById.get(n.id);
        return old ? !sameNoteGeometry(old, n) : true;
      });
      if (changedGeometry) {
        const nextNotes = target.notes.map((n) => byId.get(n.id) ?? n);
        if (hasNoteCollisions(nextNotes)) return;
      }
      commitNoteOp({ t: "note.update", diffId: did, before, after: updated });
    },
    [commitNoteOp, activeIdRef, difficultiesRef],
  );

  return {
    addNotes,
    applyCopyHitsounds,
    applyCopyHitsoundsToAll,
    applyCropToBrackets,
    applyDropShortLns,
    applyFullLong,
    applyFullRice,
    applySelectionLong,
    applySelectionRice,
    applyShiftLnEnds,
    deleteNote,
    deleteNotes,
    hitsoundSources,
    hitsoundTargets,
    moveNotes,
    placeNote,
  };
}
