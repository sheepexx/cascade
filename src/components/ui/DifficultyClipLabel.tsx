import { useMemo } from "react";
import type { ClipAssetKind } from "../../lib/clipboardAssets";
import type { DifficultyClip } from "../../lib/clipboardStore";
import { computeStarRating, starColor, starTextOn } from "../../lib/starRating";
import { useT } from "../../lib/i18n";

const ASSET_LABELS: Record<ClipAssetKind, string> = {
  audio: "Music",
  background: "Background",
  video: "Video",
};

/**
 * A copied difficulty on the clipboard, in the difficulty list's own terms:
 * its star colour, name and key count, plus the rating, note count, the files
 * that travel with it and the map it came from when shown in full.
 */
export function DifficultyClipLabel({
  clip,
  detailed = false,
}: {
  clip: DifficultyClip;
  detailed?: boolean;
}) {
  const t = useT();
  const { difficulty } = clip;
  const star = useMemo(
    () => computeStarRating(difficulty.notes, difficulty.keyCount),
    [difficulty],
  );
  const color = starColor(star);
  const name = difficulty.name || "Unnamed difficulty";
  const count = difficulty.notes.length;

  const heading = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span
        className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/30"
        style={{ backgroundColor: color }}
      />
      <span
        className={`min-w-0 flex-1 truncate ${
          detailed ? "text-[11px] font-medium text-slate-100" : "text-[10px] text-slate-400"
        }`}
        title={name}
      >
        {name}
      </span>
      <span className="shrink-0 text-[10px] text-slate-500">
        {difficulty.keyCount}K
      </span>
    </span>
  );
  if (!detailed) return <span className="min-w-0 flex-1">{heading}</span>;

  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      {heading}
      <span className="flex min-w-0 items-center gap-1.5 pl-4">
        <span
          className="shrink-0 whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-bold"
          style={{ backgroundColor: color, color: starTextOn(star) }}
        >
          ★ {star.toFixed(2)}
        </span>
        <span className="truncate text-[10px] text-slate-400">
          {t("clipLabel.notes", { count })}
        </span>
      </span>
      {!!clip.assets?.length && (
        <span className="flex flex-wrap gap-1 pl-4">
          {clip.assets.map((asset) => (
            <span
              key={asset.kind}
              title={asset.name}
              className="rounded-full border border-white/10 bg-ink-900/70 px-1.5 py-px text-[9px] text-slate-300"
            >
              {ASSET_LABELS[asset.kind]}
            </span>
          ))}
        </span>
      )}
      {clip.source && (
        <span className="truncate pl-4 text-[10px] text-slate-500" title={clip.source}>
          {clip.source}
        </span>
      )}
    </span>
  );
}
