import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";

export function HistoryModal({ open, onClose, entries, current, onJump, readOnly, live }: {
  open: boolean; onClose: () => void; entries: string[]; current: number;
  onJump: (index: number) => void; readOnly: boolean; live: boolean;
}) {
  return <Modal open={open} onClose={onClose} title="Undo history" width="max-w-xl" footer={<Button variant="ghost" onClick={onClose}>Close</Button>}>
    <p className="mb-4 text-xs text-slate-400">{live ? "Your note operations in this collaboration session. Jumping reverses or reapplies your edits while preserving other mappers’ work." : "Jump to any retained state. Later edits stay available to redo until you make a new change. The last 200 changes are kept for this session."}</p>
    <ol className="flex max-h-[55vh] flex-col gap-1 overflow-auto" aria-label="Project history">
      {entries.map((entry, index) => <li key={index}><button disabled={readOnly || index === current} aria-current={index === current ? "step" : undefined} onClick={() => onJump(index)} className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left text-xs transition ${index === current ? "border-teal-300/30 bg-teal-300/10 text-teal-100" : index > current ? "border-white/5 text-slate-500 hover:bg-white/5" : "border-white/5 text-slate-300 hover:bg-white/5"}`}>
        <span className="w-6 shrink-0 font-mono text-slate-500">{index}</span><span className="flex-1">{entry}</span>{index === current && <span className="text-[10px] uppercase">Current</span>}
      </button></li>)}
    </ol>
    {readOnly && <p className="mt-3 text-xs text-amber-200">Editing is unavailable in the current mode.</p>}
  </Modal>;
}
