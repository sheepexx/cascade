import { useCallback } from "react";
import { uid, type TimingPoint } from "../../types";
import type { AudioController } from "../../hooks/useAudio";
import { useTapTempo } from "../../hooks/useTapTempo";
import { sortedPoints } from "../../lib/timing";
import { formatTime } from "../../lib/timing";
import { Modal } from "../ui/Modal";
import { Button, NumberInput } from "../ui/Controls";

type Props = {
  open: boolean;
  onClose: () => void;
  timingPoints: TimingPoint[];
  onTimingPoints: (points: TimingPoint[]) => void;
  audio: AudioController;
};

export function TimingModal({
  open,
  onClose,
  timingPoints,
  onTimingPoints,
  audio,
}: Props) {
  const getTime = useCallback(() => audio.currentTime, [audio]);
  const { tap, reset, bpm, offset, count } = useTapTempo(getTime);

  const points = sortedPoints(timingPoints);

  const update = (id: string, patch: Partial<TimingPoint>) =>
    onTimingPoints(
      timingPoints.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

  const remove = (id: string) => {
    if (timingPoints.length <= 1) return; // always keep at least one
    onTimingPoints(timingPoints.filter((p) => p.id !== id));
  };

  const addAtPlayhead = () => {
    const t = Math.round(audio.currentTime);
    const base = points[points.length - 1]?.bpm ?? 120;
    onTimingPoints([...timingPoints, { id: uid("tp"), time: t, bpm: base }]);
  };

  const applyTap = () => {
    if (bpm === null) return;
    const time = offset !== null ? Math.round(offset) : 0;
    // Apply the detected BPM *and* offset to the timing point active at the tap
    // time (or the first point if tapping from the very start). Without setting
    // the offset, the grid would have the right spacing but the wrong phase, so
    // the beat lines wouldn't fall on the actual beats.
    const target =
      [...points].reverse().find((p) => p.time <= time) ?? points[0];
    if (target) update(target.id, { bpm, time });
  };

  /** Multiply a point's BPM (e.g. a 1.2× / 0.9× tempo section). */
  const scaleBpm = (id: string, factor: number) => {
    const p = timingPoints.find((x) => x.id === id);
    if (!p) return;
    update(id, { bpm: Math.round(p.bpm * factor * 1000) / 1000 });
  };

  return (
    <Modal open={open} onClose={onClose} title="Timing" width="max-w-lg">
      <div className="flex flex-col gap-6">
        {/* Timing point list */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Timing points
            </h3>
            <Button onClick={addAtPlayhead} variant="primary">
              + Add at playhead
            </Button>
          </div>
          <p className="text-[11px] text-slate-500">
            Each point sets the BPM from its time onward. The first point is the
            map offset. Use ×0.9 / ×1.2 for tempo-scaled sections.
          </p>

          <div className="flex flex-col gap-2">
            {points.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl border border-ink-600 bg-ink-700/40 p-2.5"
              >
                <span className="w-6 text-center text-xs text-slate-500">
                  {i + 1}
                </span>
                <label className="flex flex-col">
                  <span className="text-[10px] uppercase text-slate-500">
                    Time (ms)
                  </span>
                  <NumberInput
                    value={p.time}
                    step={1}
                    onChange={(e) =>
                      update(p.id, {
                        time: Math.round(Number(e.target.value) || 0),
                      })
                    }
                    className="w-24 py-1"
                  />
                </label>
                <label className="flex flex-col">
                  <span className="text-[10px] uppercase text-slate-500">
                    BPM
                  </span>
                  <NumberInput
                    value={p.bpm}
                    step={0.001}
                    min={1}
                    onChange={(e) =>
                      update(p.id, {
                        bpm: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                    className="w-24 py-1"
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase text-slate-500">
                    {formatTime(p.time)}
                  </span>
                  <div className="flex gap-1">
                    <MiniButton onClick={() => scaleBpm(p.id, 0.9)}>
                      ×0.9
                    </MiniButton>
                    <MiniButton onClick={() => scaleBpm(p.id, 1.2)}>
                      ×1.2
                    </MiniButton>
                  </div>
                </div>
                <button
                  onClick={() => remove(p.id)}
                  disabled={points.length <= 1}
                  className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition hover:bg-ink-600 hover:text-red-300 disabled:opacity-30"
                  title="Delete timing point"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Tap to the beat */}
        <section className="rounded-xl border border-ink-600 bg-ink-700/40 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">
            Click to the beat
          </h3>
          <p className="mb-4 text-xs text-slate-400">
            Play the song, then click on every beat. BPM is detected from your
            taps and applied to the timing point active at that moment.
          </p>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={tap}
              className="grid h-24 w-24 shrink-0 select-none place-items-center rounded-full bg-accent text-sm font-semibold text-white shadow-[0_0_30px_-8px] shadow-accent transition active:scale-95 active:bg-accent-soft"
            >
              TAP
            </button>

            <div className="flex-1">
              <div className="font-mono text-3xl text-slate-100">
                {bpm !== null ? bpm.toFixed(2) : "—"}
                <span className="ml-1 text-sm text-slate-500">BPM</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {count} tap{count === 1 ? "" : "s"}
                {offset !== null && <> · ≈ {Math.round(offset)} ms</>}
                {count < 2 && " · need at least 2"}
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={reset} disabled={count === 0}>
                  Reset
                </Button>
                <Button
                  variant="accent"
                  onClick={applyTap}
                  disabled={bpm === null}
                >
                  Apply detected
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function MiniButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded bg-ink-600 px-1.5 py-0.5 text-[10px] text-slate-300 transition hover:bg-ink-500"
    >
      {children}
    </button>
  );
}
