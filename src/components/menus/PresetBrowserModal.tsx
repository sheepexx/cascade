import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, TextInput, Toggle } from "../ui/Controls";
import { PatternPreview } from "../ui/PatternPreview";
import { SnapBadge } from "../ui/SnapBadge";
import { SkeletonMediaCards } from "../ui/Skeleton";
import { listPresets, type Preset } from "../../lib/presets";
import type { PatternNote } from "../../lib/patterns";
import { useAuth } from "../../lib/auth";
import { useT } from "../../lib/i18n";

export function PresetBrowserModal({
  open,
  onClose,
  activeKeyCount,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  activeKeyCount: number;
  onCopy: (pattern: PatternNote[]) => void;
}) {
  const t = useT();
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allKeys, setAllKeys] = useState(false);
  const [query, setQuery] = useState("");
  const { user } = useAuth();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPresets(null);
    setError(null);
    listPresets({
      ...(allKeys ? {} : { keyCount: activeKeyCount }),
      ownerId: user?.id ?? null,
    })
      .then((rows) => {
        if (!cancelled) setPresets(rows);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : t("presets.loadFailed"),
          );
      });
    return () => {
      cancelled = true;
    };
  }, [open, allKeys, activeKeyCount, user?.id, t]);

  const filtered = useMemo(() => {
    if (!presets) return null;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return presets;
    return presets.filter((p) => {
      const haystack = [
        p.name,
        p.author_username ?? "",
        p.is_public ? "public" : "private mine saved",
        ...p.tags,
        `${p.key_count}k`,
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }, [presets, query]);

  return (
    <Modal
      open={open}
      title={t("presets.title")}
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <div className="mr-auto flex items-center gap-2 text-xs text-slate-400">
          <Toggle
            size="sm"
            checked={allKeys}
            onChange={setAllKeys}
            aria-label={t("presets.allKeys")}
          />
          {t("presets.allKeys")}
        </div>
      }
    >
      <div className="mb-3">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("presets.search")}
          className="w-full"
        />
      </div>

      <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/5 px-3 py-2 text-[11px] leading-relaxed text-amber-100/80">
        {t("presets.rankNote")}
      </div>

      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!filtered && !error && (
        <SkeletonMediaCards count={4} label={t("presets.loading")} />
      )}
      {filtered && filtered.length === 0 && (
        <p className="text-sm text-slate-400">
          {presets && presets.length > 0
            ? t("presets.noMatch")
            : allKeys
              ? t("presets.none")
              : t("presets.noneForKeys", { keys: activeKeyCount })}
        </p>
      )}
      {filtered && filtered.length > 0 && (
        <div className="skeleton-swap-in grid gap-3 sm:grid-cols-2">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex gap-3 rounded-xl border border-ink-500/60 bg-ink-700/40 p-3"
            >
              <PatternPreview
                pattern={p.pattern}
                keyCount={p.key_count}
                size="large"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="truncate text-sm font-semibold text-slate-100">
                  {p.name}
                </div>
                <div className="flex flex-wrap items-center gap-1 text-[11px] text-slate-500">
                  <span>
                    {p.key_count}K · {t("diffModal.notes", { count: p.pattern.length })}
                  </span>
                  <SnapBadge pattern={p.pattern} />
                  {!p.is_public && (
                    <span className="rounded bg-accent/15 px-1 py-0.5 text-[10px] font-semibold text-accent">
                      {t("publishPreset.private")}
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {t("skin.by")}{" "}
                  {p.author_osu_id ? (
                    <a
                      href={`https://osu.ppy.sh/users/${p.author_osu_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {p.author_username ?? t("comments.unknown")}
                    </a>
                  ) : (
                    (p.author_username ?? t("comments.unknown"))
                  )}
                </div>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                    {p.description}
                  </p>
                )}
                {p.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.tags.map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => setQuery(tag)}
                        className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] text-slate-300 transition hover:bg-ink-500"
                        title={t("presets.filterBy", { tag })}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-auto pt-2">
                  <Button variant="accent" onClick={() => onCopy(p.pattern)}>
                    {t("presets.copy")}
                  </Button>
                  {p.key_count > activeKeyCount && (
                    <p className="mt-1 text-[10px] text-amber-400/80">
                      {t("presets.madeFor", { keys: p.key_count, active: activeKeyCount })}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
