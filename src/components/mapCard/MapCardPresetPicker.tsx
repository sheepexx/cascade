import { useMemo, useState } from "react";
import { Button, TextInput } from "../ui/Controls";
import { Dropdown, type DropdownOption } from "../ui/Dropdown";
import { HoldToDelete } from "../ui/HoldToDelete";
import {
  MAP_CARD_PRESET_NAME_MAX,
  cleanPresetName,
  mapCardConfigsEqual,
  type MapCardConfig,
  type MapCardPresetOption,
} from "../../lib/mapCard";
import { useT } from "../../lib/i18n";
import type { useMapCardPresets } from "../../hooks/useMapCardPresets";
import { mapCardPresetOptions } from "../../lib/mapCardCloud";
import { Notice, PanelSection, Spinner } from "./controls";

const CUSTOM = "custom";

export function MapCardPresetPicker({
  config,
  selectedId,
  presets,
  signedIn,
  onLogin,
  onSelect,
}: {
  config: MapCardConfig;
  selectedId: string | null;
  presets: ReturnType<typeof useMapCardPresets>;
  signedIn: boolean;
  onLogin: () => void;
  onSelect: (preset: MapCardPresetOption | null) => void;
}) {
  const t = useT();
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const all = useMemo(() => mapCardPresetOptions(presets.presets), [presets.presets]);
  const selected = all.find((preset) => preset.id === selectedId) ?? null;
  const matches = !!selected && mapCardConfigsEqual(selected.config, config);
  const busy = presets.busy !== null;
  const nameOf = (preset: MapCardPresetOption) =>
    preset.labelKey ? t(preset.labelKey) : preset.name;

  const options: DropdownOption<string>[] = [
    ...(matches
      ? []
      : [
          {
            value: CUSTOM,
            label: selected
              ? t("mapCard.edited", { name: nameOf(selected) })
              : t("mapCard.custom"),
          },
        ]),
    ...all.map((preset) => ({
      value: preset.id,
      label: nameOf(preset),
      hint: preset.builtIn ? t("mapCard.builtIn") : t("mapCard.savedTag"),
    })),
  ];

  const startSaving = () => {
    setDraft(selected && !selected.builtIn ? selected.name : "");
    setNaming(true);
  };

  const save = async () => {
    const name = cleanPresetName(draft);
    if (!name) return;
    const saved = await presets.save(name, config);
    if (!saved) return;
    setNaming(false);
    onSelect({ id: saved.id, name: saved.name, config: saved.config, builtIn: false });
  };

  const overwriting =
    naming &&
    presets.presets.some(
      (preset) => preset.name.toLowerCase() === cleanPresetName(draft).toLowerCase(),
    );

  return (
    <PanelSection
      title={t("mapCard.preset")}
      aside={
        presets.status === "loading" ? (
          <span className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <Spinner className="h-3 w-3" />
            {t("mapCard.loadingYours")}
          </span>
        ) : null
      }
    >
      <div className="flex gap-2">
        <Dropdown
          className="min-w-0 flex-1"
          value={matches && selected ? selected.id : CUSTOM}
          options={options}
          aria-label={t("mapCard.preset")}
          onChange={(id) => {
            if (id === CUSTOM) return;
            setNaming(false);
            onSelect(all.find((preset) => preset.id === id) ?? null);
          }}
        />
        {signedIn && !naming && (
          <Button variant="primary" onClick={startSaving} disabled={busy}>
            {t("common.save")}
          </Button>
        )}
      </div>

      {naming && (
        <div className="flex flex-col gap-2">
          <TextInput
            autoFocus
            value={draft}
            maxLength={MAP_CARD_PRESET_NAME_MAX}
            placeholder={t("mapCard.presetName")}
            aria-label={t("mapCard.presetName")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Enter") void save();
              if (event.key === "Escape") setNaming(false);
            }}
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">
              {overwriting ? t("mapCard.replacesPreset") : t("mapCard.savesToAccount")}
            </span>
            <div className="flex gap-1.5">
              <Button onClick={() => setNaming(false)} disabled={busy}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="accent"
                onClick={() => void save()}
                disabled={busy || !cleanPresetName(draft)}
              >
                {presets.busy === "saving"
                  ? t("file.saving")
                  : overwriting
                    ? t("mapCard.update")
                    : t("common.save")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {!naming && selected && !selected.builtIn && (
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>{t("mapCard.savedPreset")}</span>
          <HoldToDelete
            onConfirm={() => {
              void presets.remove(selected.id).then((removed) => {
                if (removed) onSelect(null);
              });
            }}
            disabled={busy}
            title={t("mapCard.holdToDeleteTitle")}
            className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/10 hover:text-red-300 disabled:opacity-40"
          >
            {presets.busy === "deleting" ? t("mapCard.deleting") : t("mapCard.holdToDelete")}
          </HoldToDelete>
        </div>
      )}

      {!signedIn && (
        <p className="text-[11px] leading-snug text-slate-500">
          {t("mapCard.presetsSignedOut")}{" "}
          <button
            type="button"
            onClick={onLogin}
            className="font-medium text-accent-soft underline-offset-2 hover:underline"
          >
            {t("mapCard.signIn")}
          </button>
        </p>
      )}

      {presets.error && (
        <Notice tone="error">
          <span className="min-w-0 flex-1">{presets.error}</span>
          {presets.status === "error" && (
            <button
              type="button"
              onClick={presets.retry}
              className="shrink-0 font-medium text-red-100 underline-offset-2 hover:underline"
            >
              {t("common.retry")}
            </button>
          )}
        </Notice>
      )}
    </PanelSection>
  );
}
