import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { useCollab } from "../hooks/useCollab";
import {
  describeNoteOp,
  describeSnapshotChange,
  jumpSnapshotHistory,
} from "../lib/editorHistory";
import type { Translate } from "../lib/i18n";
import type { NoteOp } from "../lib/ops";
import { applyNoteOp, invertNoteOp } from "../lib/ops";
import type { Difficulty, SongMeta, TimingPoint } from "../types";
import type { DocSnapshot, ModalId } from "./appTypes";

/**
 * Undo and redo. Outside a live session every change to the document is a
 * snapshot on a stack (up to 200), so anything undoes, including timing and
 * metadata. In a live session undo works on this user's own note ops instead,
 * inverting and broadcasting them, so it never undoes a collaborator's work.
 * The history list builds its entries only while it is on screen.
 */
export function useEditHistory({
  applyingRemoteRef,
  canEditRef,
  collabRef,
  difficulties,
  historyPanel,
  liveEnabled,
  markStructural,
  meta,
  modal,
  noteRecoveryEdit,
  opRedoRef,
  opUndoRef,
  sessionActiveRef,
  setActiveId,
  setDifficulties,
  setMeta,
  setTimingPoints,
  t,
  timingPoints,
}: {
  applyingRemoteRef: MutableRefObject<boolean>;
  canEditRef: MutableRefObject<boolean>;
  collabRef: MutableRefObject<ReturnType<typeof useCollab> | null>;
  difficulties: Difficulty[];
  historyPanel: boolean;
  liveEnabled: boolean;
  markStructural: () => void;
  meta: SongMeta;
  modal: ModalId;
  noteRecoveryEdit: (forProject?: string) => void | undefined;
  opRedoRef: MutableRefObject<NoteOp[]>;
  opUndoRef: MutableRefObject<NoteOp[]>;
  sessionActiveRef: MutableRefObject<boolean>;
  setActiveId: Dispatch<SetStateAction<string>>;
  setDifficulties: Dispatch<SetStateAction<Difficulty[]>>;
  setMeta: Dispatch<SetStateAction<SongMeta>>;
  setTimingPoints: Dispatch<SetStateAction<TimingPoint[]>>;
  t: Translate;
  timingPoints: TimingPoint[];
}) {
  const snapshot = useMemo<DocSnapshot>(
    () => ({ meta, timingPoints, difficulties }),
    [meta, timingPoints, difficulties],
  );
  const undoStackRef = useRef<DocSnapshot[]>([]);
  const redoStackRef = useRef<DocSnapshot[]>([]);
  const presentRef = useRef<DocSnapshot | null>(null);
  const applyingHistoryRef = useRef(false);
  const [historyRevision, bumpHistory] = useState(0);

  useEffect(() => {
    if (presentRef.current === null) {
      presentRef.current = snapshot;
      return;
    }
    if (applyingHistoryRef.current) {
      applyingHistoryRef.current = false;
      presentRef.current = snapshot;
      return;
    }
    if (sessionActiveRef.current || applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      presentRef.current = snapshot;
      return;
    }
    const previous = presentRef.current;
    if (previous === snapshot || (previous.meta === snapshot.meta && previous.timingPoints === snapshot.timingPoints && previous.difficulties.length === snapshot.difficulties.length && previous.difficulties.every((d, i) => d === snapshot.difficulties[i]))) {
      presentRef.current = snapshot;
      return;
    }
    undoStackRef.current.push(presentRef.current);
    if (undoStackRef.current.length > 200) undoStackRef.current.shift();
    redoStackRef.current = [];
    presentRef.current = snapshot;
    bumpHistory((v) => v + 1);
  }, [snapshot, applyingRemoteRef, sessionActiveRef]);

  const applySnapshot = useCallback((s: DocSnapshot) => {
    applyingHistoryRef.current = true;
    presentRef.current = s;
    setMeta(s.meta);
    setTimingPoints(s.timingPoints);
    setDifficulties(s.difficulties);
    setActiveId(id => s.difficulties.some(d => d.id === id) ? id : s.difficulties[0]?.id ?? id);
  }, [setActiveId, setDifficulties, setMeta, setTimingPoints]);

  const undo = useCallback(() => {
    if (sessionActiveRef.current) {
      const op = opUndoRef.current.pop();
      if (!op) return;
      const inv = invertNoteOp(op);
      markStructural();
      setDifficulties((prev) => applyNoteOp(prev, inv));
      opRedoRef.current.push(op);
      collabRef.current?.sendOp(inv);
      bumpHistory((v) => v + 1);
      return;
    }
    const prev = undoStackRef.current.pop();
    if (!prev) return;
    if (presentRef.current) redoStackRef.current.push(presentRef.current);
    applySnapshot(prev);
    noteRecoveryEdit();
    bumpHistory((v) => v + 1);
  }, [applySnapshot, markStructural, noteRecoveryEdit, collabRef, opRedoRef, opUndoRef, sessionActiveRef, setDifficulties]);

  const redo = useCallback(() => {
    if (sessionActiveRef.current) {
      const op = opRedoRef.current.pop();
      if (!op) return;
      markStructural();
      setDifficulties((prev) => applyNoteOp(prev, op));
      opUndoRef.current.push(op);
      collabRef.current?.sendOp(op);
      bumpHistory((v) => v + 1);
      return;
    }
    const next = redoStackRef.current.pop();
    if (!next) return;
    if (presentRef.current) undoStackRef.current.push(presentRef.current);
    applySnapshot(next);
    noteRecoveryEdit();
    bumpHistory((v) => v + 1);
  }, [applySnapshot, markStructural, noteRecoveryEdit, collabRef, opRedoRef, opUndoRef, sessionActiveRef, setDifficulties]);

  const canUndo = liveEnabled
    ? opUndoRef.current.length > 0
    : undoStackRef.current.length > 0;
  const canRedo = liveEnabled
    ? opRedoRef.current.length > 0
    : redoStackRef.current.length > 0;

  const historyCurrent = liveEnabled ? opUndoRef.current.length : undoStackRef.current.length;
  const historyEntries = useMemo(() => {
    void historyRevision;
    if (modal !== "history" && !historyPanel) return [];
    if (liveEnabled) {
      const names = new Map(difficulties.map(d => [d.id, d.name]));
      return [t("app.historyStart"), ...[...opUndoRef.current, ...opRedoRef.current.slice().reverse()].map(op => describeNoteOp(op, names))];
    }
    const states = [...undoStackRef.current, presentRef.current ?? snapshot, ...redoStackRef.current.slice().reverse()];
    return states.map((s, i) => i === 0 ? t("app.historyStart") : describeSnapshotChange(states[i - 1], s));
  }, [modal, historyPanel, liveEnabled, difficulties, snapshot, historyRevision, t, opRedoRef, opUndoRef]);

  const jumpHistory = useCallback((index: number) => {
    if (!canEditRef.current) return;
    if (sessionActiveRef.current) {
      if (!Number.isInteger(index) || index < 0 || index > opUndoRef.current.length + opRedoRef.current.length) return;
      const operations: NoteOp[] = [];
      while (opUndoRef.current.length > index) {
        const op = opUndoRef.current.pop()!;
        opRedoRef.current.push(op); operations.push(invertNoteOp(op));
      }
      while (opUndoRef.current.length < index) {
        const op = opRedoRef.current.pop()!;
        opUndoRef.current.push(op); operations.push(op);
      }
      if (!operations.length) return;
      markStructural();
      setDifficulties(prev => operations.reduce((state, op) => applyNoteOp(state, op), prev));
      for (const op of operations) collabRef.current?.sendOp(op);
    } else {
      if (!presentRef.current || index === undoStackRef.current.length) return;
      const result = jumpSnapshotHistory(undoStackRef.current, presentRef.current, redoStackRef.current, index);
      if (!result) return;
      undoStackRef.current = result.past; redoStackRef.current = result.future;
      applySnapshot(result.present);
      noteRecoveryEdit();
    }
    bumpHistory(v => v + 1);
  }, [applySnapshot, markStructural, noteRecoveryEdit, canEditRef, collabRef, opRedoRef, opUndoRef, sessionActiveRef, setDifficulties]);

  return {
    applyingHistoryRef,
    canRedo,
    canUndo,
    historyCurrent,
    historyEntries,
    jumpHistory,
    redo,
    redoStackRef,
    undo,
    undoStackRef,
  };
}
