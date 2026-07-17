import { useEffect, useState } from "react";
import type { SnapDivisor } from "../../types";
import { Modal } from "../ui/Modal";
import { Button, Field, NumberInput } from "../ui/Controls";

export type HitsoundSource = {
  id: string;
  name: string;
  hitsoundCount: number;
  noteCount: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  snapDivisor: SnapDivisor;
  riceCount: number;
  holdCount: number;
  lnTicks: number;
  onLnTicks: (ticks: number) => void;
  onFullLong: (ticks: number) => void;
  onFullRice: () => void;
  trimActive: boolean;
  cropRemoveCount: number;
  cropClampCount: number;
  onCropToBrackets: () => void;
  hitsoundSources: HitsoundSource[];
  onCopyHitsounds: (sourceId: string) => void;
};

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
  trimActive,
  cropRemoveCount,
  cropClampCount,
  onCropToBrackets,
  hitsoundSources,
  onCopyHitsounds,
}: Props) {
  const cropTotal = cropRemoveCount + cropClampCount;
  const [sourceId, setSourceId] = useState("");

  // Keep the selection valid as difficulties come and go.
  useEffect(() => {
    if (hitsoundSources.length === 0) {
      if (sourceId) setSourceId("");
      return;
    }
    if (!hitsoundSources.some((s) => s.id === sourceId)) {
      setSourceId(hitsoundSources[0].id);
    }
  }, [hitsoundSources, sourceId]);

  const selectedSource = hitsoundSources.find((s) => s.id === sourceId) ?? null;

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

        <div className="rounded-xl border border-ink-500/60 bg-ink-700/40 p-3">
          <div className="mb-2 text-sm font-medium text-slate-200">
            Copy hitsounds
          </div>
          <p className="mb-3 text-[11px] text-slate-500">
            Clone hitsounds from another difficulty onto this one, matching notes
            by time (and column where possible). Only notes at matching times are
            touched.
          </p>
          {hitsoundSources.length === 0 ? (
            <p className="text-[11px] text-slate-500">
              Add another difficulty to copy hitsounds from.
            </p>
          ) : (
            <>
              <Field label="Source difficulty">
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="rounded-lg border border-white/10 bg-ink-700 px-2 py-2 text-sm text-slate-100 outline-none"
                >
                  {hitsoundSources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.hitsoundCount} hitsounded)
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                variant="accent"
                className="mt-3"
                onClick={() => sourceId && onCopyHitsounds(sourceId)}
                disabled={!selectedSource || selectedSource.hitsoundCount === 0}
              >
                Copy from {selectedSource?.name ?? "…"}
              </Button>
              {selectedSource && selectedSource.hitsoundCount === 0 && (
                <p className="mt-2 text-[11px] text-slate-500">
                  That difficulty has no hitsounds to copy.
                </p>
              )}
            </>
          )}
        </div>

        <div className="rounded-xl border border-ink-500/60 bg-ink-700/40 p-3">
          <div className="mb-2 text-sm font-medium text-slate-200">
            Crop to brackets
          </div>
          <p className="mb-3 text-[11px] text-slate-500">
            Deletes every note that starts outside the trim brackets and trims
            any hold running past the end bracket - the same cut the .osz export
            bakes in.{" "}
            {!trimActive
              ? "Set the trim brackets on the timeline first."
              : cropTotal === 0
                ? "Nothing is outside the brackets."
                : `${cropRemoveCount} note${
                    cropRemoveCount === 1 ? "" : "s"
                  } to delete${
                    cropClampCount
                      ? `, ${cropClampCount} hold${
                          cropClampCount === 1 ? "" : "s"
                        } to trim`
                      : ""
                  }.`}
          </p>
          <Button
            variant="accent"
            onClick={onCropToBrackets}
            disabled={!trimActive || cropTotal === 0}
          >
            Crop to brackets
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
