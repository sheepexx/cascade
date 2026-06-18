import type { BackgroundScope } from "../../types";
import { Modal } from "../ui/Modal";

type Props = {
  open: boolean;
  /** Preview of the just-added image. */
  previewUrl: string | null;
  onChoose: (scope: BackgroundScope) => void;
  onClose: () => void;
};

/** Asks whether a newly added background covers the whole set or one diff. */
export function BackgroundScopeModal({
  open,
  previewUrl,
  onChoose,
  onClose,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Background added">
      <div className="flex flex-col gap-4">
        {previewUrl && (
          <img
            src={previewUrl}
            alt="background preview"
            className="h-32 w-full rounded-lg object-cover"
          />
        )}
        <p className="text-sm text-slate-300">
          Where should this background apply?
        </p>
        <div className="grid gap-2">
          <button
            onClick={() => onChoose("mapset")}
            className="rounded-xl border border-ink-500/60 bg-ink-700 px-4 py-3 text-left transition hover:border-accent/60 hover:bg-ink-600"
          >
            <div className="text-sm font-semibold text-slate-100">
              Whole mapset
            </div>
            <div className="text-xs text-slate-400">
              Use for every difficulty in this set.
            </div>
          </button>
          <button
            onClick={() => onChoose("difficulty")}
            className="rounded-xl border border-ink-500/60 bg-ink-700 px-4 py-3 text-left transition hover:border-accent/60 hover:bg-ink-600"
          >
            <div className="text-sm font-semibold text-slate-100">
              Just this difficulty
            </div>
            <div className="text-xs text-slate-400">
              Only the difficulty you're editing now.
            </div>
          </button>
        </div>
      </div>
    </Modal>
  );
}
