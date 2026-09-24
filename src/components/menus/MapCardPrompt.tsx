import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { Dropdown, type DropdownOption } from "../ui/Dropdown";
import { ToolDiagram } from "../ui/ToolDiagrams";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";
import { loadLastMapCardConfig, type MapCardPresetOption } from "../../lib/mapCard";
import { mapCardPresetOptions } from "../../lib/mapCardCloud";
import { useMapCardPresets } from "../../hooks/useMapCardPresets";
import { CARD_LABEL, Spinner, ToggleRow } from "../mapCard/controls";

const LAST_USED = "last";

export function MapCardPrompt({
  open,
  target,
  askAfterExport,
  onAskAfterExport,
  onSkip,
  onCreate,
}: {
  open: boolean;
  target: string;
  askAfterExport: boolean;
  onAskAfterExport: (value: boolean) => void;
  onSkip: () => void;
  onCreate: (preset: MapCardPresetOption | null) => void;
}) {
  const { user } = useAuth();
  const t = useT();
  const presets = useMapCardPresets(user?.id ?? null, open);
  const all = useMemo(() => mapCardPresetOptions(presets.presets), [presets.presets]);
  const [hasLast, setHasLast] = useState(false);
  const [choice, setChoice] = useState<string>("builtin:default");

  useEffect(() => {
    if (!open) return;
    const last = loadLastMapCardConfig() !== null;
    setHasLast(last);
    setChoice(last ? LAST_USED : "builtin:default");
  }, [open]);

  const options: DropdownOption<string>[] = [
    ...(hasLast ? [{ value: LAST_USED, label: t("mapCard.lastSettings") }] : []),
    ...all.map((preset) => ({
      value: preset.id,
      label: preset.labelKey ? t(preset.labelKey) : preset.name,
      hint: preset.builtIn ? t("mapCard.builtIn") : t("mapCard.savedTag"),
    })),
  ];

  return (
    <Modal
      open={open}
      onClose={onSkip}
      title={t("mapCard.promptTitle")}
      width="max-w-sm"
      footer={
        <>
          <Button onClick={onSkip}>{t("mapCard.skip")}</Button>
          <Button
            variant="accent"
            onClick={() =>
              onCreate(
                choice === LAST_USED
                  ? null
                  : all.find((preset) => preset.id === choice) ?? null,
              )
            }
          >
            {t("mapCard.create")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <ToolDiagram name="mapCard" />
        <p className="text-sm leading-relaxed text-slate-300">
          {t("mapCard.promptBody", { target })}
        </p>
        <div className="flex flex-col gap-1.5">
          <span className={CARD_LABEL}>{t("mapCard.startFrom")}</span>
          <Dropdown
            value={choice}
            options={options}
            onChange={setChoice}
            aria-label={t("mapCard.startFrom")}
          />
          {presets.status === "loading" && (
            <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <Spinner className="h-3 w-3" />
              {t("mapCard.loadingSaved")}
            </span>
          )}
          {presets.status === "error" && (
            <span className="text-[11px] text-red-300">
              {t("mapCard.savedFailed")}
            </span>
          )}
        </div>
        <ToggleRow
          label={t("mapCard.askAfterExport")}
          hint={t("mapCard.askHint")}
          checked={askAfterExport}
          onChange={onAskAfterExport}
        />
      </div>
    </Modal>
  );
}
