import { useState } from "react";
import type { Difficulty, SongMeta } from "../../types";
import type { BatchOptions, BatchRequest } from "../../lib/batchApply";
import { Modal } from "../ui/Modal";
import { Button, Field, Select, TextInput } from "../ui/Controls";

export function BatchApplyModal({ source, difficulties, meta, onClose, onApply, readOnly, live }: {
  source: Difficulty; difficulties: Difficulty[]; meta: SongMeta; onClose: () => void;
  onApply: (request: BatchRequest) => void; readOnly: boolean; live?: boolean;
}) {
  const eligible = difficulties.filter(d => d.id !== source.id && d.audioFilename === source.audioFilename);
  const [targets, setTargets] = useState(() => new Set(eligible.map(d => d.id)));
  const [options, setOptions] = useState<BatchOptions>({ timing: "red", preview: false, difficultySettings: false });
  const [editMeta, setEditMeta] = useState(false);
  const [draft, setDraft] = useState(meta);
  const hasDiffChanges = options.timing !== "none" || options.preview || options.difficultySettings;
  const canApply = !readOnly && ((targets.size > 0 && hasDiffChanges) || editMeta);
  return <Modal open onClose={onClose} title="Batch apply across difficulties" width="max-w-2xl" footer={<>
    <Button variant="primary" disabled={!canApply} onClick={() => { onApply({ sourceId: source.id, targetIds: hasDiffChanges ? [...targets] : [], options, meta: editMeta ? draft : undefined }); onClose(); }}>Apply changes</Button>
    <Button variant="ghost" onClick={onClose}>Cancel</Button>
  </>}>
    <p className="mb-4 text-sm text-slate-300">Copy from <strong>{source.name}</strong>. Timing and preview positions are converted for each difficulty’s audio rate. Notes keep their positions.</p>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Field label="Timing"><Select value={options.timing} onChange={e => setOptions(o => ({ ...o, timing: e.target.value as BatchOptions["timing"] }))}>
          <option value="none">Keep each difficulty’s timing</option><option value="red">BPM / offset only (keep SV)</option><option value="all">Replace all timing, SV and volume</option>
        </Select></Field>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={options.preview} onChange={e => setOptions(o => ({ ...o, preview: e.target.checked }))} />Preview point</label>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={options.difficultySettings} onChange={e => setOptions(o => ({ ...o, difficultySettings: e.target.checked }))} />HP, OD and default sample set</label>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={editMeta} onChange={e => setEditMeta(e.target.checked)} />Edit shared song metadata</label>
      </div>
      <div className="rounded-xl border border-white/10 p-3">
        <div className="mb-2 flex justify-between text-xs"><strong>Target difficulties</strong><button onClick={() => setTargets(targets.size === eligible.length ? new Set() : new Set(eligible.map(d => d.id)))} className="text-accent">{targets.size === eligible.length ? "Clear" : "Select all"}</button></div>
        <div className="flex max-h-48 flex-col gap-2 overflow-auto">{difficulties.filter(d => d.id !== source.id).map(d => {
          const sameAudio = eligible.some(e => e.id === d.id);
          return <label key={d.id} className={`flex items-center gap-2 text-xs ${sameAudio ? "text-slate-300" : "text-slate-500"}`}><input type="checkbox" disabled={!sameAudio} checked={targets.has(d.id)} onChange={e => setTargets(prev => { const next = new Set(prev); if (e.target.checked) next.add(d.id); else next.delete(d.id); return next; })} /><span>{d.name} · {d.keyCount}K {sameAudio ? "" : "· different audio"}</span></label>;
        })}</div>
        {!eligible.length && <p className="text-xs text-slate-500">No other difficulties use this audio.</p>}
      </div>
    </div>
    {editMeta && <div className="mt-4 grid gap-3 sm:grid-cols-2">{(["title", "artist", "creator", "titleUnicode", "artistUnicode", "source", "tags"] as const).map(key => <Field key={key} label={({ titleUnicode: "Original-script title", artistUnicode: "Original-script artist" } as Record<string, string>)[key] ?? key}><TextInput value={draft[key] ?? ""} onChange={e => setDraft(m => ({ ...m, [key]: e.target.value }))} /></Field>)}</div>}
    <p className="mt-4 rounded-lg bg-teal-300/10 p-3 text-xs text-teal-100">{hasDiffChanges ? `${targets.size} target difficulties will be updated. ` : ""}{editMeta ? `Song metadata applies to all ${difficulties.length} difficulties. ` : "Song metadata is already shared by the whole mapset. "}{live ? "Changes are shared with collaborators. Session undo covers note edits only." : "You can review this as one change in undo history."}</p>
  </Modal>;
}
