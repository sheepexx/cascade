import type { PackItem } from "../types/packCreator";
import { generatePackDifficultyName } from "../lib/packCreator";
import { Field, TextInput, Toggle } from "./ui/Controls";

/** Editor for one imported map (one difficulty of the final pack). */
export function PackCreatorItem({
  item,
  onChange,
  onRemove,
}: {
  item: PackItem;
  onChange: (patch: Partial<PackItem>) => void;
  onRemove: () => void;
}) {
  const preview = generatePackDifficultyName(item);

  return (
    <div className="flex flex-col gap-3">
      {/* Where this map came from (read-only). */}
      <div className="rounded-lg border border-white/10 bg-ink-700/40 p-3 text-xs">
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Original map
        </p>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-slate-400">
          <dt className="text-slate-500">Title</dt>
          <dd className="truncate text-slate-300">{item.originalTitle || "(none)"}</dd>
          <dt className="text-slate-500">Artist</dt>
          <dd className="truncate">{item.originalArtist || "(none)"}</dd>
          <dt className="text-slate-500">Mapper</dt>
          <dd className="truncate">{item.originalCreator || "(none)"}</dd>
          <dt className="text-slate-500">Difficulty</dt>
          <dd className="truncate">
            {item.originalVersion || "(none)"}
            {item.parsedOsu.keyCount ? ` · ${item.parsedOsu.keyCount}K` : ""}
          </dd>
          {item.sourceFileName && (
            <>
              <dt className="text-slate-500">From</dt>
              <dd className="truncate">{item.sourceFileName}</dd>
            </>
          )}
        </dl>
        {item.nonMania && (
          <p className="mt-2 text-[11px] font-medium text-amber-300">
            Not an osu!mania map. It will be exported unconverted.
          </p>
        )}
      </div>

      <Field label="Song display name">
        <TextInput
          value={item.songDisplayName}
          onChange={(e) => onChange({ songDisplayName: e.target.value })}
          placeholder="Song name used in the difficulty name"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Rate" hint="e.g. x1.2, x0.9, DT">
          <TextInput
            value={item.rate ?? ""}
            onChange={(e) => {
              const rate = e.target.value || undefined;
              const patch: Partial<PackItem> = { rate };
              // Entering a rate into an empty field turns on its inclusion so
              // the difficulty name updates as expected; editing an existing
              // rate leaves the toggle as the user set it.
              if (rate && !item.rate) patch.includeRateInDifficultyName = true;
              onChange(patch);
            }}
            placeholder="none"
          />
        </Field>
        <Field label="Mapper name">
          <TextInput
            value={item.mapperName}
            onChange={(e) => onChange({ mapperName: e.target.value })}
          />
        </Field>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-ink-700/40 p-3">
        <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
          Include rate in difficulty name
          <Toggle
            size="sm"
            checked={item.includeRateInDifficultyName}
            onChange={(v) => onChange({ includeRateInDifficultyName: v })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
          Include original difficulty name
          <Toggle
            size="sm"
            checked={item.includeOriginalDifficultyName}
            onChange={(v) => onChange({ includeOriginalDifficultyName: v })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-xs text-slate-300">
          Include mapper in [brackets]
          <Toggle
            size="sm"
            checked={item.includeMapperInBrackets}
            onChange={(v) => onChange({ includeMapperInBrackets: v })}
          />
        </label>
      </div>

      <Field
        label="Creator field override (optional)"
        hint="Overrides the exported Creator field for this difficulty only."
      >
        <TextInput
          value={item.creatorFieldOverride ?? ""}
          onChange={(e) =>
            onChange({ creatorFieldOverride: e.target.value || undefined })
          }
          placeholder="use pack setting"
        />
      </Field>

      <div className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-soft">
          Final difficulty name
        </p>
        <p className="mt-0.5 break-words text-sm font-medium text-slate-100">
          {preview || "(empty)"}
        </p>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="self-start text-xs font-medium text-rose-400 transition hover:text-rose-300 hover:underline"
      >
        Remove from pack
      </button>
    </div>
  );
}
