import { useState, type ReactNode } from "react";
import type { SnapDivisor } from "../../types";
import { snapTickDivisor } from "../../lib/timing";
import { InfoTip } from "../ui/Tooltip";
import { Modal } from "../ui/Modal";
import { Button, Field, NumberInput } from "../ui/Controls";
import { ToolDiagram, type ToolDiagramName } from "../ui/ToolDiagrams";
import { useT } from "../../lib/i18n";

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
  /** Rice and hold counts inside the current selection. */
  selectionRice: number;
  selectionHolds: number;
  onSelectionLong: (ticks: number) => void;
  onSelectionRice: () => void;
  onShiftLnEnds: (deltaMs: number) => void;
  onDropShortLns: (minMs: number) => void;
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
  selectionRice,
  selectionHolds,
  onSelectionLong,
  onSelectionRice,
  onShiftLnEnds,
  onDropShortLns,
  trimActive,
  cropRemoveCount,
  cropClampCount,
  onCropToBrackets,
  ghostNotesActive,
  ghostNotesReady,
  ghostNotesAllowed,
  onGhostNotes,
}: Props) {
  const t = useT();
  const cropTotal = cropRemoveCount + cropClampCount;
  const noteTotal = riceCount + holdCount;
  const selectionTotal = selectionRice + selectionHolds;
  const [endShiftMs, setEndShiftMs] = useState(10);
  // Matches the shortest hold AiMod accepts.
  const [minLnMs, setMinLnMs] = useState(30);

  return (
    <Modal open={open} onClose={onClose} title={t("nav.tools")} width="max-w-2xl">
      <div className="flex flex-col gap-3">
        <p className="text-[11px] text-slate-500">
          {t("tools.activeSummary", { rice: riceCount, holds: holdCount })}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <ToolCard
            title={t("tools.ghostTitle")}
            image="ghostNotes"
            info={t("tools.ghostInfo")}
            status={
              !ghostNotesAllowed
                ? t("tools.ghostNoAccess")
                : !ghostNotesReady
                  ? t("tools.ghostNoAudio")
                  : ghostNotesActive
                    ? t("tools.ghostShowing")
                    : t("tools.ghostIdle")
            }
          >
            {ghostNotesActive ? (
              <Button onClick={() => onGhostNotes(false)}>{t("tools.hideSuggestions")}</Button>
            ) : (
              <Button
                variant="accent"
                disabled={!ghostNotesReady || !ghostNotesAllowed}
                onClick={() => {
                  onGhostNotes(true);
                  onClose();
                }}
              >
                {t("tools.showSuggestions")}
              </Button>
            )}
          </ToolCard>

          <ToolCard
            title="Full LN"
            image="fullLn"
            info={t("tools.fullLnInfo")}
            status={
              noteTotal === 0
                ? t("tools.noNotes")
                : t("tools.fullLnStatus")
            }
          >
            <Field label={t("tools.gap", { divisor: snapTickDivisor(snapDivisor) })}>
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
              {t("common.apply")}
            </Button>
          </ToolCard>

          <ToolCard
            title="Full RC"
            image="fullRc"
            info={t("tools.fullRcInfo")}
            status={
              holdCount === 0
                ? t("tools.noLongNotes")
                : t("tools.fullRcStatus", { count: holdCount })
            }
          >
            <Button variant="accent" onClick={onFullRice} disabled={holdCount === 0}>
              {t("common.apply")}
            </Button>
          </ToolCard>

          <ToolCard
            title={t("tools.selectedTitle")}
            image="fullLn"
            info={t("tools.selectedInfo")}
            status={
              selectionTotal === 0
                ? t("tools.selectFirst")
                : t("tools.selectionSummary", { rice: selectionRice, holds: t("tools.holds", { count: selectionHolds }) })
            }
          >
            <Field label={t("tools.gap", { divisor: snapTickDivisor(snapDivisor) })}>
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
              onClick={() => onSelectionLong(lnTicks)}
              disabled={selectionTotal === 0}
            >
              {t("tools.toLn")}
            </Button>
            <Button onClick={onSelectionRice} disabled={selectionHolds === 0}>
              {t("tools.toRice")}
            </Button>
          </ToolCard>

          <ToolCard
            title={t("tools.endsTitle")}
            image="fullRc"
            info={t("tools.endsInfo")}
            status={
              selectionHolds === 0
                ? t("tools.selectLnFirst")
                : t("tools.holdsSelected", { count: selectionHolds })
            }
          >
            <Field label={t("tools.moveEnds")}>
              <NumberInput
                min={-2000}
                max={2000}
                step={1}
                value={endShiftMs}
                onChange={(e) =>
                  setEndShiftMs(clampInt(e.target.value, -2000, 2000, endShiftMs))
                }
                className="w-24"
              />
            </Field>
            <Button
              variant="accent"
              onClick={() => onShiftLnEnds(endShiftMs)}
              disabled={selectionHolds === 0 || endShiftMs === 0}
            >
              {t("tools.move")}
            </Button>
            <Field label={t("tools.dropUnder")}>
              <NumberInput
                min={1}
                max={2000}
                step={1}
                value={minLnMs}
                onChange={(e) =>
                  setMinLnMs(clampInt(e.target.value, 1, 2000, minLnMs))
                }
                className="w-24"
              />
            </Field>
            <Button
              onClick={() => onDropShortLns(minLnMs)}
              disabled={selectionHolds === 0}
            >
              {t("tools.drop")}
            </Button>
          </ToolCard>

          <ToolCard
            title={t("tools.cropTitle")}
            image="crop"
            info={t("tools.cropInfo")}
            status={
              !trimActive
                ? t("tools.setBrackets")
                : cropTotal === 0
                  ? t("tools.nothingOutside")
                  : cropClampCount
                    ? t("tools.cropBoth", { notes: t("tools.cropNotes", { count: cropRemoveCount }), holds: t("tools.cropHolds", { count: cropClampCount }) })
                    : t("tools.cropOnly", { notes: t("tools.cropNotes", { count: cropRemoveCount }) })
            }
          >
            <Button
              variant="accent"
              onClick={onCropToBrackets}
              disabled={!trimActive || cropTotal === 0}
            >
              {t("tools.crop")}
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
