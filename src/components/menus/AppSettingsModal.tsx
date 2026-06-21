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
  /** Whether hitsounds play during playback. */
  hitsoundsEnabled: boolean;
  onHitsoundsEnabled: (value: boolean) => void;
  /** Hitsound volume (perceived slider position 0..1). */
  hitsoundVolume: number;
  onHitsoundVolume: (value: number) => void;
  /** Background dim strength in the editor, 0..100. */
  dimBackground: number;
  onDimBackground: (value: number) => void;
  /** Whether the whole local project autosaves to IndexedDB. */
  localAutosaveEnabled: boolean;
  onLocalAutosaveEnabled: (value: boolean) => void;
};

/**
 * Editor preferences: playfield size, the default long-note body width and the
 * hitsound sample set / volume. Skin selection lives in its own modal
 * ({@link SkinModal}).
 */
export function AppSettingsModal({
  open,
  onClose,
  playfieldScale,
  onPlayfieldScale,
  longNoteBodyScale,
  onLongNoteBodyScale,
  hitsoundsEnabled,
  onHitsoundsEnabled,
  hitsoundVolume,
  onHitsoundVolume,
  dimBackground,
  onDimBackground,
  localAutosaveEnabled,
  onLocalAutosaveEnabled,
}: Props) {
  return (
    <Modal open={open} onClose={onClose} title="Settings">
      <div className="flex flex-col gap-6">
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Playfield
          </h3>
          <div className="flex flex-col gap-2">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
              <span>Background dim</span>
              <span className="font-medium text-slate-200">
                {Math.round(dimBackground)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={dimBackground}
              onChange={(e) => onDimBackground(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent"
            />
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
              Higher dim keeps the notefield easier to read. Size / zoom is
              visual only.
            </p>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Local save
          </h3>
          <label className="flex items-center justify-between text-xs text-slate-300">
            <span>Autosave local project</span>
            <input
              type="checkbox"
              checked={localAutosaveEnabled}
              onChange={(e) => onLocalAutosaveEnabled(e.target.checked)}
              className="h-4 w-4 cursor-pointer accent-accent"
            />
          </label>
          <p className="mt-2 text-[11px] text-slate-500">
            Saves the full project on this device, including audio,
            difficulties and background files. Ctrl+S still saves locally.
          </p>
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

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Hitsounds
          </h3>
          <div className="flex flex-col gap-4">
            <label className="flex items-center justify-between text-xs text-slate-300">
              <span>Play hitsounds during playback</span>
              <input
                type="checkbox"
                checked={hitsoundsEnabled}
                onChange={(e) => onHitsoundsEnabled(e.target.checked)}
                className="h-4 w-4 cursor-pointer accent-accent"
              />
            </label>

            <div className="flex flex-col gap-2">
              <p className="text-[11px] text-slate-500">
                Hitsounds now follow the map: each note plays its own sample set
                (normal / soft / drum) and additions (whistle, finish, clap).
                Edit them with the hitsound toolbar at the bottom of the editor,
                or the W / F / C keys.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Volume</span>
                <span className="font-medium text-slate-200">
                  {Math.round(hitsoundVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={hitsoundVolume}
                disabled={!hitsoundsEnabled}
                onChange={(e) => onHitsoundVolume(Number(e.target.value))}
                className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-600 accent-accent disabled:cursor-not-allowed disabled:opacity-40"
              />
              <p className="text-[11px] text-slate-500">
                Independent of the song volume. Also adjustable from the
                transport bar (&ldquo;Hit&rdquo;).
              </p>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}
