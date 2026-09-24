import { useState } from "react";
import type { Difficulty } from "../../types";
import type { BatchOptions, BatchRequest } from "../../lib/batchApply";
import { Button, Field, Select } from "../ui/Controls";
import { useT } from "../../lib/i18n";

export function BatchApplyPanel({ source, difficulties, onApply, readOnly, live }: {
  source: Difficulty; difficulties: Difficulty[];
  onApply: (request: BatchRequest) => void; readOnly: boolean; live?: boolean;
}) {
  const t = useT();
  const eligible = difficulties.filter(d => d.id !== source.id && d.audioFilename === source.audioFilename);
  const [targets, setTargets] = useState(() => new Set(eligible.map(d => d.id)));
  const [options, setOptions] = useState<BatchOptions>({ timing: "red", preview: false, difficultySettings: false });
  const [applied, setApplied] = useState(0);
  const patchOptions = (patch: Partial<BatchOptions>) => { setApplied(0); setOptions(o => ({ ...o, ...patch })); };
  const changeTargets = (next: Set<string>) => { setApplied(0); setTargets(next); };
  const hasChanges = options.timing !== "none" || options.preview || options.difficultySettings;
  const canApply = !readOnly && targets.size > 0 && hasChanges;
  return <div className="flex flex-col gap-5">
    <p className="text-sm text-slate-300">{t("batch.copyFrom")} <strong>{source.name}</strong>{t("batch.copyFromAfter")}</p>
    <div className="grid gap-5 sm:grid-cols-2">
      <div className="flex flex-col gap-3">
        <Field label={t("nav.timing")}><Select value={options.timing} onChange={e => patchOptions({ timing: e.target.value as BatchOptions["timing"] })}>
          <option value="none">{t("batch.timingNone")}</option><option value="red">{t("batch.timingRed")}</option><option value="all">{t("batch.timingAll")}</option>
        </Select></Field>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={options.preview} onChange={e => patchOptions({ preview: e.target.checked })} />{t("timing.previewPoint")}</label>
        <label className="flex gap-2 text-xs"><input type="checkbox" checked={options.difficultySettings} onChange={e => patchOptions({ difficultySettings: e.target.checked })} />{t("batch.difficultySettings")}</label>
      </div>
      <div className="rounded-xl border border-white/10 p-3">
        <div className="mb-2 flex justify-between text-xs"><strong>{t("batch.targets")}</strong>{eligible.length > 0 && <button onClick={() => changeTargets(targets.size === eligible.length ? new Set() : new Set(eligible.map(d => d.id)))} className="text-accent">{targets.size === eligible.length ? t("timing.clear") : t("batch.selectAll")}</button>}</div>
        <div className="flex max-h-48 flex-col gap-2 overflow-auto">{difficulties.filter(d => d.id !== source.id).map(d => {
          const sameAudio = eligible.some(e => e.id === d.id);
          return <label key={d.id} className={`flex items-center gap-2 text-xs ${sameAudio ? "text-slate-300" : "text-slate-500"}`}><input type="checkbox" disabled={!sameAudio} checked={targets.has(d.id)} onChange={e => { const next = new Set(targets); if (e.target.checked) next.add(d.id); else next.delete(d.id); changeTargets(next); }} /><span>{d.name} · {d.keyCount}K {sameAudio ? "" : `· ${t("batch.differentAudio")}`}</span></label>;
        })}</div>
        {!eligible.length && <p className="text-xs text-slate-500">{t("batch.noEligible")}</p>}
      </div>
    </div>
    <p className="rounded-lg bg-teal-300/10 p-3 text-xs text-teal-100">{!eligible.length ? `${t("batch.addSecond")} ${t("batch.metadataShared")}` : <>{hasChanges ? t("batch.willUpdate", { count: targets.size }) : t("batch.pickOne")} {t("batch.metadataShared")} {live ? t("batch.liveNote") : t("batch.undoNote")}</>}</p>
    <div className="flex items-center gap-3">
      <Button variant="primary" disabled={!canApply} onClick={() => { onApply({ sourceId: source.id, targetIds: [...targets], options }); setApplied(targets.size); }}>{t("batch.apply")}</Button>
      {applied > 0 && <span role="status" className="text-xs text-teal-200">{t("batch.applied", { count: applied })}</span>}
    </div>
  </div>;
}
