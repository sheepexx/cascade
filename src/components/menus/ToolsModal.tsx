import type { SnapDivisor } from "../../types";
import { Modal } from "../ui/Modal";
import { Button, Field, NumberInput } from "../ui/Controls";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Note tools operate on the active difficulty. */
  snapDivisor: SnapDivisor;
  riceCount: number;
  holdCount: number;
  lnTicks: number;
  onLnTicks: (ticks: number) => void;
  onFullLong: (ticks: number) => void;
  onFullRice: () => void;
};

/** Bulk note-editing tools for the active difficulty (Full LN / Full RC). */
export function ToolsModal({
  open,
  onClose,
  snapDivisor,
  riceCount,
  holdCount,
  lnTicks,
  onLnTicks,
  onFullLong,
  onFullRice,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Tools">
      <div className="flex flex-col gap-4">
        <p className="text-[11px] text-slate-500">
          Operate on the active difficulty ({riceCount} rice · {holdCount}{" "}
          holds). Undoable with Ctrl+Z.
        </p>

        <div className="rounded-xl border border-ink-500/60 bg-ink-700/40 p-3">
          <div className="mb-2 text-sm font-medium text-slate-200">Full LN</div>
          <p className="mb-3 text-[11px] text-slate-500">
            Turns every note into a long note ending a set number of ticks
            before the next note in its lane. Existing holds only get longer.
          </p>
          <Field label={`Gap (ticks @ 1/${snapDivisor})`}>
            <NumberInput
              min={0}
              max={64}
              step={1}
              value={lnTicks}
              onChange={(e) =>
                onLnTicks(clampInt(e.target.value, 0, 64, lnTicks))
              }
              className="w-24"
            />
          </Field>
          <Button
            variant="accent"
            className="mt-3"
            onClick={() => onFullLong(lnTicks)}
            disabled={riceCount + holdCount === 0}
          >
            Apply Full LN
          </Button>
        </div>

        <div className="rounded-xl border border-ink-500/60 bg-ink-700/40 p-3">
          <div className="mb-2 text-sm font-medium text-slate-200">Full RC</div>
          <p className="mb-3 text-[11px] text-slate-500">
            Turns every long note back into a single rice note.
          </p>
          <Button variant="accent" onClick={onFullRice} disabled={holdCount === 0}>
            Apply Full RC
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function clampInt(
  v: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
