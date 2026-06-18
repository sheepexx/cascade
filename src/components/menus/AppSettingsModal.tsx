import { Modal } from "../ui/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Current playfield size multiplier (0.5 .. 2). */
  playfieldScale: number;
  onPlayfieldScale: (value: number) => void;
  /** Current default long-note body width multiplier (0.2 .. 1). */
  longNoteBodyScale: number;
  onLongNoteBodyScale: (value: number) => void;
};

/**
 * Editor preferences: playfield size and the default long-note body width.
 * Skin selection lives in its own modal ({@link SkinModal}).
 */
export function AppSettingsModal({
  open,
  onClose,
  playfieldScale,
  onPlayfieldScale,
  longNoteBodyScale,
  onLongNoteBodyScale,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Playfield
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Size / zoom</span>
              <span className="font-medium text-slate-200">
                {Math.round(playfieldScale * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={playfieldScale}
              onChange={(e) => onPlayfieldScale(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
            />
            <p className="text-[11px] text-slate-500">
              Scales the overall size of the editor playfield. Visual only.
            </p>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Long notes
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Body width</span>
              <span className="font-medium text-slate-200">
                {Math.round(longNoteBodyScale * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0.2}
              max={1}
              step={0.05}
              value={longNoteBodyScale}
              onChange={(e) => onLongNoteBodyScale(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
            />
            <p className="text-[11px] text-slate-500">
              Width of the default long-note body (the gray part), relative to
              the lane. Only applies when no skin body sprite is used.
            </p>
          </div>
        </section>
      </div>
    </Modal>
  );
}
