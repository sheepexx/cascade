import type { DocState, NoteOp } from "./ops";

export function describeNoteOp(op: NoteOp, names: Map<string, string>): string {
  const count = op.t === "note.update" ? op.after.length : op.notes.length;
  return `${op.t === "note.add" ? "Add" : op.t === "note.remove" ? "Delete" : "Edit"} ${count} note${count === 1 ? "" : "s"} · ${names.get(op.diffId) ?? "Difficulty"}`;
}

export function describeSnapshotChange(before: DocState, after: DocState): string {
  const changes: string[] = [];
  if (before.meta !== after.meta) changes.push("Edit song metadata");
  const old = new Map(before.difficulties.map(d => [d.id, d]));
  const removed = before.difficulties.filter(d => !after.difficulties.some(n => n.id === d.id));
  if (removed.length) changes.push(`Remove ${removed.length} difficult${removed.length === 1 ? "y" : "ies"}`);
  for (const d of after.difficulties) {
    const prev = old.get(d.id);
    if (!prev) { changes.push(`Add difficulty · ${d.name}`); continue; }
    if (prev === d) continue;
    if (prev.notes !== d.notes) {
      const delta = d.notes.length - prev.notes.length;
      changes.push(`${delta > 0 ? `Add ${delta}` : delta < 0 ? `Delete ${-delta}` : "Edit"} notes · ${d.name}`);
    } else if (prev.timingPoints !== d.timingPoints) changes.push(`Edit timing · ${d.name}`);
    else changes.push(`Edit difficulty · ${d.name}`);
  }
  if (!changes.length && before.timingPoints !== after.timingPoints) return "Edit shared timing";
  return changes.length > 2 ? `${changes.slice(0, 2).join("; ")} +${changes.length - 2} more` : changes.join("; ") || "Edit project";
}

export function jumpSnapshotHistory<T>(past: T[], present: T, future: T[], index: number) {
  const timeline = [...past, present, ...future.slice().reverse()];
  if (!Number.isInteger(index) || index < 0 || index >= timeline.length) return null;
  return { past: timeline.slice(0, index), present: timeline[index], future: timeline.slice(index + 1).reverse() };
}
