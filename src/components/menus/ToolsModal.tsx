import type { ReactNode } from "react";
import type { SnapDivisor } from "../../types";
import { snapTickDivisor } from "../../lib/timing";
import { InfoTip } from "../ui/Tooltip";
import { Modal } from "../ui/Modal";
import { Button, Field, NumberInput } from "../ui/Controls";
import { ToolDiagram, type ToolDiagramName } from "../ui/ToolDiagrams";

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
  ghostNotesActive: boolean;
  ghostNotesReady: boolean;
  ghostNotesAllowed: boolean;
  onGhostNotes: (enabled: boolean) => void;
};

function ToolCard({
  title,
  image,
  info,
  status,
  children,
}: {
  title: string;
  image: ToolDiagramName;
  info: string;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col rounded-xl border border-ink-500/60 bg-ink-700/40 p-3"
    >
      <ToolDiagram name={image} />
      <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-200">
        {title}
        <InfoTip content={info} />
      </div>
      <p className="mt-1 text-[11px] leading-snug text-slate-500">{status}</p>
      <div className="mt-auto flex flex-wrap items-end gap-2 pt-3">
        {children}
      </div>
    </section>
  );
}

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
  ghostNotesActive,
  ghostNotesReady,
  ghostNotesAllowed,
  onGhostNotes,
}: Props) {
  const cropTotal = cropRemoveCount + cropClampCount;
  const noteTotal = riceCount + holdCount;

  return (
    <Modal open={open} onClose={onClose} title="Tools" width="max-w-2xl">
      <div className="flex flex-col gap-3">
        <p className="text-[11px] text-slate-500">
          Active difficulty: {riceCount} rice · {holdCount} holds
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <ToolCard
            title="Note suggestions"
            image="ghostNotes"
            info="Listens to the song and puts dashed notes on your snap grid wherever the music hits. Click a dashed note to place it, right-click to dismiss it, or use Place all for a quick first draft you can then edit."
            status={
              !ghostNotesAllowed
                ? "Only editors of this map can place notes."
                : !ghostNotesReady
                  ? "Load audio to get suggestions."
                  : ghostNotesActive
                    ? "Suggestions are showing in the editor."
                    : "Shows dashed notes where the music hits. Click one to place it."
            }
          >
            {ghostNotesActive ? (
              <Button onClick={() => onGhostNotes(false)}>Hide suggestions</Button>
            ) : (
              <Button
                variant="accent"
                disabled={!ghostNotesReady || !ghostNotesAllowed}
                onClick={() => {
                  onGhostNotes(true);
                  onClose();
                }}
              >
                Show suggestions
              </Button>
            )}
          </ToolCard>

          <ToolCard
            title="Full LN"
            image="fullLn"
            info="Turns every note into a long note ending a set number of ticks before the next note in its lane. Existing holds only get longer."
            status={
              noteTotal === 0
                ? "This difficulty has no notes yet."
                : "Every note becomes a long note."
            }
          >
            <Field label={`Gap (ticks @ 1/${snapTickDivisor(snapDivisor)})`}>
              <NumberInput
                min={0}
                max={64}
                step={1}
                value={lnTicks}
                onChange={(e) =>
                  onLnTicks(clampInt(e.target.value, 0, 64, lnTicks))
                }
                className="w-20"
              />
            </Field>
            <Button
              variant="accent"
              onClick={() => onFullLong(lnTicks)}
              disabled={noteTotal === 0}
            >
              Apply
            </Button>
          </ToolCard>

          <ToolCard
            title="Full RC"
            image="fullRc"
            info="Turns every long note back into a single rice note at its start. Rice notes stay as they are."
            status={
              holdCount === 0
                ? "No long notes to convert."
                : `${holdCount} long note${holdCount === 1 ? "" : "s"} become${
                    holdCount === 1 ? "s" : ""
                  } rice.`
            }
          >
            <Button variant="accent" onClick={onFullRice} disabled={holdCount === 0}>
              Apply
            </Button>
          </ToolCard>

          <ToolCard
            title="Crop to brackets"
            image="crop"
            info="Deletes every note that starts outside the trim brackets and trims any hold running past the end bracket, the same cut the .osz export bakes in."
            status={
              !trimActive
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
                    }.`
            }
          >
            <Button
              variant="accent"
              onClick={onCropToBrackets}
              disabled={!trimActive || cropTotal === 0}
            >
              Crop
            </Button>
          </ToolCard>
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
