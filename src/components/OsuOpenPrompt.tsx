import { useT } from "../lib/i18n";
import { osuMapLabel, type OsuSelectedMap } from "../lib/osuDesktop";

type Props = {
  map: OsuSelectedMap;
  busy?: boolean;
  onOpen: () => void;
  className?: string;
};

/**
 * Offers the map osu! currently sits on. Shown wherever the user is about to
 * pick a map from somewhere else — the start menu, and the new-map and import
 * dialogs — so the map already in front of them in song select is one click
 * away. Rendered only while the watcher can actually see a map, so it never
 * appears as a dead entry.
 */
export function OsuOpenPrompt({ map, busy = false, onOpen, className }: Props) {
  const t = useT();
  const label = osuMapLabel(map);

  return (
    <div
      className={`flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-left ${className ?? ""}`}
    >
      <span
        aria-hidden
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/20 text-base"
      >
        🎯
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-100">
          {t("osu.openSelected", { name: label })}
        </span>
        <span className="block truncate text-xs text-slate-400">
          {t("osu.openSelectedHint")}
        </span>
      </span>
      <button
        type="button"
        onClick={onOpen}
        disabled={busy}
        className="shrink-0 rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-ink-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? t("osu.opening") : t("common.open")}
      </button>
    </div>
  );
}
