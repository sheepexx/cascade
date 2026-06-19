import { useEffect, useState } from "react";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { PatternPreview } from "../ui/PatternPreview";
import { listPresets, type Preset } from "../../lib/presets";
import type { PatternNote } from "../../lib/patterns";

/**
 * Browse approved pattern presets and insert one at the playhead. Defaults to
 * presets matching the active difficulty's key count, with a toggle for all.
 */
export function PresetBrowserModal({
  open,
  onClose,
  activeKeyCount,
  onInsert,
}: {
  open: boolean;
  onClose: () => void;
  activeKeyCount: number;
  onInsert: (pattern: PatternNote[]) => void;
}) {
  const [presets, setPresets] = useState<Preset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [allKeys, setAllKeys] = useState(false);

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

  return (
    <Modal
      open={open}
      title="Pattern presets"
      onClose={onClose}
      width="max-w-3xl"
      footer={
        <label className="mr-auto flex items-center gap-2 text-xs text-slate-400">
          <input
            type="checkbox"
            checked={allKeys}
            onChange={(e) => setAllKeys(e.target.checked)}
          />
          Show all key counts
        </label>
      }
    >
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!presets && !error && (
        <p className="text-sm text-slate-400">Loading presets…</p>
      )}
      {presets && presets.length === 0 && (
        <p className="text-sm text-slate-400">
          No presets{allKeys ? "" : ` for ${activeKeyCount}K`} yet. Copy some
          notes in the editor and use “Save as preset”.
        </p>
      )}
      {presets && presets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {presets.map((p) => (
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
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                    {p.description}
                  </p>
                )}
                {p.tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <span
                        key={t}
                        className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] text-slate-300"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-auto pt-2">
                  <Button
                    variant="accent"
                    onClick={() => onInsert(p.pattern)}
                    disabled={p.key_count > activeKeyCount}
                    title={
                      p.key_count > activeKeyCount
                        ? `Needs at least ${p.key_count} columns`
                        : "Insert at the playhead"
                    }
                  >
                    Insert at playhead
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
