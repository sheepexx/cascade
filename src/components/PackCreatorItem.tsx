import type { PackItem } from "../types/packCreator";
import { generatePackDifficultyName } from "../lib/packCreator";
import { Button, Field, TextInput, Toggle } from "./ui/Controls";
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
    <div className="flex flex-col">
      {/* The name this difficulty will carry in the pack leads: everything
          below exists to shape it. */}
      <div className="pb-4">
        <p className="text-xs font-medium text-slate-500">{t("packItem.finalName")}</p>
        <p className="mt-1 break-words font-display text-xl font-bold leading-snug text-slate-50">
          {preview || <span className="text-slate-500">{t("packItem.empty")}</span>}
        </p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
          <dt className="text-slate-500">{t("packItem.titleLabel")}</dt>
          <dd className="truncate text-slate-300">{item.originalTitle || t("packItem.none")}</dd>
          <dt className="text-slate-500">{t("packItem.artist")}</dt>
          <dd className="truncate text-slate-300">{item.originalArtist || t("packItem.none")}</dd>
          <dt className="text-slate-500">{t("packItem.mapper")}</dt>
          <dd className="truncate text-slate-300">{item.originalCreator || t("packItem.none")}</dd>
          <dt className="text-slate-500">{t("nav.difficulty")}</dt>
          <dd className="truncate text-slate-300">
            {item.originalVersion || t("packItem.none")}
            {item.parsedOsu.keyCount ? ` · ${item.parsedOsu.keyCount}K` : ""}
          </dd>
          {item.sourceFileName && (
            <>
              <dt className="text-slate-500">{t("packItem.from")}</dt>
              <dd className="truncate font-mono text-2xs leading-[1.125rem] text-slate-400">{item.sourceFileName}</dd>
            </>
          )}
        </dl>
        {item.nonMania && (
          <p className="mt-2 text-xs font-medium text-amber-300">
            {t("packItem.notMania")}
          </p>
        )}
      </div>

      <div className="grid gap-x-4 gap-y-3 border-t border-white/[0.06] py-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={t("packItem.displayName")}>
            <TextInput
              value={item.songDisplayName}
              onChange={(e) => onChange({ songDisplayName: e.target.value })}
              placeholder={t("packItem.displayNamePlaceholder")}
            />
          </Field>
        </div>
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

      <div className="divide-y divide-white/[0.05] border-t border-white/[0.06]">
        {(
          [
            ["includeRateInDifficultyName", "packItem.includeRate"],
            ["includeOriginalDifficultyName", "packItem.includeOriginal"],
            ["includeMapperInBrackets", "packItem.includeMapper"],
          ] as const
        ).map(([key, label]) => (
          <label
            key={key}
            className="flex min-h-[2.5rem] cursor-pointer items-center justify-between gap-3 text-sm text-slate-200"
          >
            {t(label)}
            <Toggle
              size="sm"
              checked={item[key]}
              onChange={(v) => onChange({ [key]: v })}
            />
          </label>
        ))}
      </div>

      <div className="border-t border-white/[0.06] py-4">
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
      </div>

      <div className="border-t border-white/[0.06] pt-4">
        <Button variant="danger" size="sm" onClick={onRemove}>
          {t("pack.removeFromPack")}
        </Button>
      </div>
    </div>
  );
}
