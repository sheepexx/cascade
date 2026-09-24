import type { PackItem } from "../types/packCreator";
import { generatePackDifficultyName } from "../lib/packCreator";
import { Field, TextInput, Toggle } from "./ui/Controls";
import { useT } from "../lib/i18n";

function clampRate(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(10, Math.max(0, n));
}

export function PackCreatorItem({
  item,
  onChange,
  onRemove,
}: {
  item: PackItem;
  onChange: (patch: Partial<PackItem>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const preview = generatePackDifficultyName(item);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-white/10 bg-ink-700/40 p-3 text-xs">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          {t("packItem.original")}
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-slate-400">
          <dt className="text-slate-500">{t("packItem.titleLabel")}</dt>
          <dd className="truncate text-slate-300">{item.originalTitle || t("packItem.none")}</dd>
          <dt className="text-slate-500">{t("packItem.artist")}</dt>
          <dd className="truncate">{item.originalArtist || t("packItem.none")}</dd>
          <dt className="text-slate-500">{t("packItem.mapper")}</dt>
          <dd className="truncate">{item.originalCreator || t("packItem.none")}</dd>
          <dt className="text-slate-500">{t("nav.difficulty")}</dt>
          <dd className="truncate">
            {item.originalVersion || t("packItem.none")}
            {item.parsedOsu.keyCount ? ` · ${item.parsedOsu.keyCount}K` : ""}
          </dd>
          {item.sourceFileName && (
            <>
              <dt className="text-slate-500">{t("packItem.from")}</dt>
              <dd className="truncate">{item.sourceFileName}</dd>
            </>
          )}
        </dl>
        {item.nonMania && (
          <p className="mt-2 text-[11px] font-medium text-amber-300">
            {t("packItem.notMania")}
          </p>
        )}
      </div>

      <Field label={t("packItem.displayName")}>
        <TextInput
          value={item.songDisplayName}
          onChange={(e) => onChange({ songDisplayName: e.target.value })}
          placeholder={t("packItem.displayNamePlaceholder")}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("rate.rate")} hint={t("packItem.rateHint")}>
          <TextInput
            value={item.rate ?? ""}
            onChange={(e) => {
              const rate = e.target.value || undefined;
              const patch: Partial<PackItem> = { rate };
              if (rate && !item.rate) patch.includeRateInDifficultyName = true;
              onChange(patch);
            }}
            placeholder={t("packItem.rateNone")}
          />
        </Field>
        <Field label={t("packItem.mapperName")}>
          <TextInput
            value={item.mapperName}
            onChange={(e) => onChange({ mapperName: e.target.value })}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="OD" hint={t("packItem.odHint")}>
          <TextInput
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={item.overallDifficulty}
            onChange={(e) =>
              onChange({ overallDifficulty: clampRate(e.target.value) })
            }
          />
        </Field>
        <Field label="HP" hint={t("packItem.hpHint")}>
          <TextInput
            type="number"
            min={0}
            max={10}
            step={0.1}
            value={item.hpDrainRate}
            onChange={(e) =>
              onChange({ hpDrainRate: clampRate(e.target.value) })
            }
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-ink-700/40 p-3">
        <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
          {t("packItem.includeRate")}
          <Toggle
            size="sm"
            checked={item.includeRateInDifficultyName}
            onChange={(v) => onChange({ includeRateInDifficultyName: v })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
          {t("packItem.includeOriginal")}
          <Toggle
            size="sm"
            checked={item.includeOriginalDifficultyName}
            onChange={(v) => onChange({ includeOriginalDifficultyName: v })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
          {t("packItem.includeMapper")}
          <Toggle
            size="sm"
            checked={item.includeMapperInBrackets}
            onChange={(v) => onChange({ includeMapperInBrackets: v })}
          />
        </label>
      </div>

      <Field
        label={t("packItem.creatorOverride")}
        hint={t("packItem.creatorOverrideHint")}
      >
        <TextInput
          value={item.creatorFieldOverride ?? ""}
          onChange={(e) =>
            onChange({ creatorFieldOverride: e.target.value || undefined })
          }
          placeholder={t("packItem.usePackSetting")}
        />
      </Field>

      <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-soft">
          {t("packItem.finalName")}
        </p>
        <p className="mt-0.5 break-words text-sm font-medium text-slate-100">
          {preview || t("packItem.empty")}
        </p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="self-start text-xs font-medium text-rose-400 transition hover:text-rose-300 hover:underline"
      >
        {t("pack.removeFromPack")}
      </button>
    </div>
  );
}
