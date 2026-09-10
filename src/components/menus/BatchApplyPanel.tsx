import { useState } from "react";
import type { Difficulty } from "../../types";
import type { BatchOptions, BatchRequest } from "../../lib/batchApply";
import { Button, Field, Select } from "../ui/Controls";

export function BatchApplyPanel({ source, difficulties, onApply, readOnly, live }: {
  source: Difficulty; difficulties: Difficulty[];
  onApply: (request: BatchRequest) => void; readOnly: boolean; live?: boolean;
}) {
  const eligible = difficulties.filter(d => d.id !== source.id && d.audioFilename === source.audioFilename);
  const [targets, setTargets] = useState(() => new Set(eligible.map(d => d.id)));
  const [options, setOptions] = useState<BatchOptions>({ timing: "red", preview: false, difficultySettings: false });
  const [applied, setApplied] = useState(0);
  const patchOptions = (patch: Partial<BatchOptions>) => { setApplied(0); setOptions(o => ({ ...o, ...patch })); };
  const changeTargets = (next: Set<string>) => { setApplied(0); setTargets(next); };
  const hasChanges = options.timing !== "none" || options.preview || options.difficultySettings;
  const canApply = !readOnly && targets.size > 0 && hasChanges;
  return <div className="flex flex-col gap-5">
    <p className="text-sm text-slate-300">Copy from <strong>{source.name}</strong>. Timing and preview positions are converted for each difficulty’s audio rate. Notes keep their positions.</p>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Field label="Timing"><Select value={options.timing} onChange={e => patchOptions({ timing: e.target.value as BatchOptions["timing"] })}>
          <option value="none">Keep each difficulty’s timing</option><option value="red">BPM / offset only (keep SV)</option><option value="all">Replace all timing, SV and volume</option>
        </Select></Field>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={options.preview} onChange={e => patchOptions({ preview: e.target.checked })} />Preview point</label>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={options.difficultySettings} onChange={e => patchOptions({ difficultySettings: e.target.checked })} />HP, OD and default sample set</label>
      </div>
      <div className="rounded-xl border border-white/10 p-3">
        <div className="mb-2 flex justify-between text-xs"><strong>Target difficulties</strong>{eligible.length > 0 && <button onClick={() => changeTargets(targets.size === eligible.length ? new Set() : new Set(eligible.map(d => d.id)))} className="text-accent">{targets.size === eligible.length ? "Clear" : "Select all"}</button>}</div>
        <div className="flex max-h-48 flex-col gap-2 overflow-auto">{difficulties.filter(d => d.id !== source.id).map(d => {
          const sameAudio = eligible.some(e => e.id === d.id);
          return <label key={d.id} className={`flex items-center gap-2 text-xs ${sameAudio ? "text-slate-300" : "text-slate-500"}`}><input type="checkbox" disabled={!sameAudio} checked={targets.has(d.id)} onChange={e => { const next = new Set(targets); if (e.target.checked) next.add(d.id); else next.delete(d.id); changeTargets(next); }} /><span>{d.name} · {d.keyCount}K {sameAudio ? "" : "· different audio"}</span></label>;
        })}</div>
        {!eligible.length && <p className="text-xs text-slate-500">No other difficulties use this audio.</p>}
      </div>
    </div>
    <p className="rounded-lg bg-teal-300/10 p-3 text-xs text-teal-100">{!eligible.length ? "Add a second difficulty to this mapset to copy timing and settings across. Song metadata is already shared by the whole mapset." : <>{hasChanges ? `${targets.size} target ${targets.size === 1 ? "difficulty" : "difficulties"} will be updated. ` : "Pick at least one thing to copy. "}Song metadata is already shared by the whole mapset. {live ? "Changes are shared with collaborators. Session undo covers note edits only." : "You can review this as one change in undo history."}</>}</p>
    <div className="flex items-center gap-3">
      <Button variant="primary" disabled={!canApply} onClick={() => { onApply({ sourceId: source.id, targetIds: [...targets], options }); setApplied(targets.size); }}>Apply changes</Button>
      {applied > 0 && <span role="status" className="text-xs text-teal-200">Applied to {applied} {applied === 1 ? "difficulty" : "difficulties"}.</span>}
    </div>
  </div>;
}
