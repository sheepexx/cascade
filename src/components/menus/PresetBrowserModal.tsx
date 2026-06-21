import { useEffect, useMemo, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button, TextInput, Toggle } from "../ui/Controls";
import { PatternPreview } from "../ui/PatternPreview";
import { listPresets, type Preset } from "../../lib/presets";
import type { PatternNote } from "../../lib/patterns";

/**
 * Browse approved pattern presets and copy one to the editor clipboard (paste
 * with Ctrl+V where you want it). Search matches name, author, tags and key
 * count; the toggle widens the listing to every key count.
 */
export function PresetBrowserModal({
  open,
  onClose,
  activeKeyCount,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  activeKeyCount: number;
  /** Copy this pattern into the editor clipboard. */
  onCopy: (pattern: PatternNote[]) => void;
}) {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allKeys, setAllKeys] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPresets(null);
    setError(null);
    listPresets(allKeys ? undefined : { keyCount: activeKeyCount })
      .then((rows) => {
        if (!cancelled) setPresets(rows);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Failed to load presets.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [open, allKeys, activeKeyCount]);

  // Client-side search: every space-separated term must appear somewhere in the
  // preset's name, author, tags or "<n>k" key label.
  const filtered = useMemo(() => {
    if (!presets) return null;
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return presets;
    return presets.filter((p) => {
      const haystack = [
        p.name,
        p.author_username ?? "",
        ...p.tags,
        `${p.key_count}k`,
      ]
        .join(" ")
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [presets, query]);

  return (
    <Modal
      open={open}
      title="Pattern presets"
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <div className="mr-auto flex items-center gap-2 text-xs text-slate-400">
          <Toggle
            size="sm"
            checked={allKeys}
            onChange={setAllKeys}
            aria-label="Show all key counts"
          />
          Show all key counts
        </div>
      }
    >
      <div className="mb-3">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, user, tag or key count (e.g. “sheepex jack 4k”)"
          className="w-full"
        />
      </div>

      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!filtered && !error && (
        <p className="text-sm text-slate-400">Loading presets…</p>
      )}
      {filtered && filtered.length === 0 && (
        <p className="text-sm text-slate-400">
          {presets && presets.length > 0
            ? "No presets match your search."
            : `No presets${allKeys ? "" : ` for ${activeKeyCount}K`} yet. Copy ` +
              "some notes in the editor and use “Save as preset”."}
        </p>
      )}
      {filtered && filtered.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
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
                <div className="text-[11px] text-slate-500">
                  {p.key_count}K · {p.pattern.length} notes
                </div>
                <div className="text-[11px] text-slate-500">
                  by{" "}
                  {p.author_osu_id ? (
                    <a
                      href={`https://osu.ppy.sh/users/${p.author_osu_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {p.author_username ?? "unknown"}
                    </a>
                  ) : (
                    (p.author_username ?? "unknown")
                  )}
                </div>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                    {p.description}
                  </p>
                )}
                {p.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setQuery(t)}
                        className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] text-slate-300 transition hover:bg-ink-500"
                        title={`Filter by “${t}”`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-auto pt-2">
                  <Button variant="accent" onClick={() => onCopy(p.pattern)}>
                    Copy to clipboard
                  </Button>
                  {p.key_count > activeKeyCount && (
                    <p className="mt-1 text-[10px] text-amber-400/80">
                      Made for {p.key_count}K — columns past {activeKeyCount} are
                      dropped on paste.
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
