import { useCallback, useEffect, useState } from "react";
import {
  clampSv,
  makeGreenPoint,
  makeRedPoint,
  svToBeatLength,
  uid,
  type TimingPoint,
} from "../../types";
import type { AudioController } from "../../hooks/useAudio";
import { useTapTempo } from "../../hooks/useTapTempo";
import { useMetronome } from "../../hooks/useMetronome";
import { formatTime, sortedPoints } from "../../lib/timing";
import { Modal } from "../ui/Modal";
import { Button, NumberInput, Toggle } from "../ui/Controls";

type Props = {
  open: boolean;
  onClose: () => void;
  timingPoints: TimingPoint[];
  onTimingPoints: (points: TimingPoint[]) => void;
  audio: AudioController;
};

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1] as const;
const OFFSET_NUDGES = [-10, -5, -1, 1, 5, 10] as const;
const SV_PRESETS = [0.5, 0.75, 1, 1.5, 2] as const;

export function TimingModal({
  open,
  onClose,
  timingPoints,
  onTimingPoints,
  audio,
}: Props) {
  const getTime = useCallback(() => audio.currentTime, [audio]);
  const { tap, reset, bpm, offset, count } = useTapTempo(getTime);
  const [metronomeOn, setMetronomeOn] = useState(true);
  // Which beat of the bar is currently sounding (0 = downbeat), plus the meter
  // in force, bumped every tick so the indicator boxes light up one-by-one in
  // sync with the click.
  const [beat, setBeat] = useState<{ index: number; meter: number; n: number } | null>(
    null,
  );

  // Metronome preview clicks the beat while the song plays (only while open).
  useMetronome(
    audio.currentTime,
    audio.isPlaying,
    timingPoints,
    open && metronomeOn,
    ({ beat: b, meter }) => {
      const index = ((b % meter) + meter) % meter;
      setBeat((prev) => ({ index, meter, n: (prev?.n ?? 0) + 1 }));
    },
  );

  // Clear the lit box when playback stops or the metronome is off.
  useEffect(() => {
    if (!audio.isPlaying || !metronomeOn) setBeat(null);
  }, [audio.isPlaying, metronomeOn]);

  // Space toggles playback while the Timing modal is open (the global Space
  // hotkey is suppressed whenever a modal is open). Ignore it while typing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        (tag === "INPUT" && (t as HTMLInputElement).type !== "range") ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable
      )
        return;
      e.preventDefault();
      if (tag !== "BODY") t?.blur();
      audio.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, audio]);

  const points = sortedPoints(timingPoints);
  const reds = points.filter((p) => p.uninherited);
  const firstRed = reds[0] ?? null;
  // Box count follows the meter the metronome is actually clicking; fall back to
  // the first red point's meter when stopped.
  const meter = Math.max(
    1,
    Math.round(beat?.meter ?? firstRed?.meter ?? 4),
  );

  const update = (id: string, patch: Partial<TimingPoint>) =>
    onTimingPoints(
      timingPoints.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

  const remove = (id: string) => {
    // Always keep at least one red point (the offset).
    const p = timingPoints.find((x) => x.id === id);
    if (p?.uninherited && reds.length <= 1) return;
    onTimingPoints(timingPoints.filter((x) => x.id !== id));
  };

  const addRed = () => {
    const t = Math.round(audio.currentTime);
    const base = [...reds].reverse().find((p) => p.time <= t) ?? firstRed;
    onTimingPoints([
      ...timingPoints,
      makeRedPoint(t, base?.bpm ?? 120, {
        meter: base?.meter ?? 4,
        volume: base?.volume ?? 100,
      }),
    ]);
  };

  const addGreen = () => {
    const t = Math.round(audio.currentTime);
    const prevGreen = [...points].reverse().find((p) => !p.uninherited && p.time <= t);
    onTimingPoints([
      ...timingPoints,
      makeGreenPoint(t, prevGreen?.sv ?? 1, {
        volume: prevGreen?.volume ?? 100,
      }),
    ]);
  };

  const duplicate = (id: string) => {
    const p = timingPoints.find((x) => x.id === id);
    if (!p) return;
    onTimingPoints([
      ...timingPoints,
      { ...p, id: uid("tp"), time: Math.round(audio.currentTime) },
    ]);
  };

  const moveToPlayhead = (id: string) =>
    update(id, { time: Math.round(audio.currentTime) });

  const setOffset = () => {
    if (!firstRed) return;
    update(firstRed.id, { time: Math.round(audio.currentTime) });
  };

  const nudgeOffset = (delta: number) => {
    if (!firstRed) return;
    update(firstRed.id, { time: Math.round(firstRed.time + delta) });
  };

  const applyTap = () => {
    if (bpm === null) return;
    const time = offset !== null ? Math.round(offset) : 0;
    // Apply the detected BPM and offset to the red point active at the tap time
    // (or the first red point). Setting the offset gives the grid the right
    // phase so beat lines fall on the actual beats.
    const target = [...reds].reverse().find((p) => p.time <= time) ?? firstRed;
    if (target) update(target.id, { bpm, time });
  };

  return (
    <Modal open={open} onClose={onClose} title="Timing" width="max-w-2xl">
      <div className="flex flex-col gap-6">
        {/* Playback speed + metronome */}
        <section className="flex flex-nowrap items-center gap-4 rounded-xl border border-ink-600 bg-ink-700/40 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Playback</span>
            <div className="flex overflow-hidden rounded-md border border-ink-500/60">
              {PLAYBACK_RATES.map((rate) => (
                <button
                  key={rate}
                  onClick={() => audio.setPlaybackRate(rate)}
                  className={`px-2.5 py-1 text-xs font-medium transition ${
                    Math.abs(audio.playbackRate - rate) < 0.001
                      ? "bg-accent text-white"
                      : "bg-ink-700 text-slate-300 hover:bg-ink-600"
                  }`}
                >
                  {Math.round(rate * 100)}%
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-300">
            <Toggle
              size="sm"
              checked={metronomeOn}
              onChange={setMetronomeOn}
              aria-label="Metronome"
            />
            Metronome
          </div>

          {/* Beat indicator: one box per beat in the bar, lit in sync with the
              click. Downbeat flashes white, the off-beats flash orange. */}
          <div className="flex items-center gap-1.5">
            {Array.from({ length: meter }).map((_, i) => {
              const active = beat?.index === i;
              const downbeat = i === 0;
              const color = downbeat ? "#ffffff" : "#ff9d4d";
              return (
                <span
                  key={i}
                  className="h-5 w-5 rounded-md border transition-all duration-150 ease-out"
                  style={{
                    backgroundColor: active ? color : "transparent",
                    borderColor: active ? color : "#33333f",
                    opacity: active ? 1 : 0.35,
                    transform: active ? "scale(1.1)" : "scale(1)",
                  }}
                />
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => audio.toggle()}
            className="ml-auto inline-flex min-w-[7.5rem] items-center justify-center rounded-md border border-ink-500/60 bg-ink-700 px-3 py-1 text-xs font-medium text-slate-200 transition hover:bg-ink-600"
            title="Space"
          >
            <span className="inline-flex w-12 justify-end">
              {audio.isPlaying ? "❚❚ Pause" : "▶ Play"}
            </span>
            <span className="ml-1.5 text-[10px] text-slate-500">Space</span>
          </button>
        </section>

        {/* Offset workflow */}
        <section className="flex flex-col gap-2 rounded-xl border border-ink-600 bg-ink-700/40 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Offset (first red point)
            </h3>
            <span className="font-mono text-xs text-slate-300">
              {firstRed ? `${firstRed.time} ms · ${formatTime(firstRed.time)}` : "-"}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={setOffset} variant="primary">
              Set to playhead
            </Button>
            <div className="flex overflow-hidden rounded-md border border-ink-500/60">
              {OFFSET_NUDGES.map((d) => (
                <button
                  key={d}
                  onClick={() => nudgeOffset(d)}
                  className="bg-ink-700 px-2 py-1 text-xs font-medium text-slate-300 transition hover:bg-ink-600"
                >
                  {d > 0 ? `+${d}` : d}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-500">ms</span>
          </div>
        </section>

        {/* Timing point list */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Timing points
            </h3>
            <div className="flex gap-2">
              <Button onClick={addRed} variant="primary">
                + Red at playhead
              </Button>
              <Button onClick={addGreen} variant="primary">
                + Green at playhead
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-slate-500">
            Red points set BPM, meter and the beat grid. Green points set scroll
            velocity (SV), volume and kiai. SV value = −100 / inheritedBeatLength.
          </p>

          <div className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto pr-1">
            {points.map((p, i) => (
              <PointRow
                key={p.id}
                point={p}
                index={i + 1}
                canDelete={!(p.uninherited && reds.length <= 1)}
                onUpdate={(patch) => update(p.id, patch)}
                onDelete={() => remove(p.id)}
                onDuplicate={() => duplicate(p.id)}
                onMove={() => moveToPlayhead(p.id)}
              />
            ))}
          </div>
        </section>

        {/* Tap to the beat */}
        <section className="rounded-xl border border-ink-600 bg-ink-700/40 p-4">
          <h3 className="mb-1 text-sm font-semibold text-slate-200">
            Click to the beat
          </h3>
          <p className="mb-4 text-xs text-slate-400">
            Play the song and click on every beat. The BPM and the offset (where
            beat 1 lands) are fit from your taps - the more continuous beats you
            click, the more accurate both become.
          </p>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={tap}
              className="grid h-24 w-24 shrink-0 select-none place-items-center rounded-full bg-accent text-sm font-semibold text-white transition active:scale-95 active:bg-accent-soft"
            >
              TAP
            </button>

            <div className="flex-1">
              <div className="font-mono text-3xl text-slate-100">
                {bpm !== null ? bpm.toFixed(2) : "-"}
                <span className="ml-1 text-sm text-slate-500">BPM</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {count} tap{count === 1 ? "" : "s"}
                {offset !== null && <> · offset ≈ {Math.round(offset)} ms</>}
                {count < 2 && " · need at least 2"}
              </div>
              <div className="mt-3 flex gap-2">
                <Button onClick={reset} disabled={count === 0}>
                  Reset
                </Button>
                <Button variant="accent" onClick={applyTap} disabled={bpm === null}>
                  Apply BPM + offset
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </Modal>
  );
}

function PointRow({
  point: p,
  index,
  canDelete,
  onUpdate,
  onDelete,
  onDuplicate,
  onMove,
}: {
  point: TimingPoint;
  index: number;
  canDelete: boolean;
  onUpdate: (patch: Partial<TimingPoint>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: () => void;
}) {
  const red = p.uninherited;
  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-2.5 ${
        red
          ? "border-rose-500/40 bg-rose-950/20"
          : "border-emerald-500/40 bg-emerald-950/20"
      }`}
    >
      <div className="flex flex-wrap items-end gap-2">
        <span className="w-5 text-center text-xs text-slate-500">{index}</span>
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
            red ? "bg-rose-500/30 text-rose-200" : "bg-emerald-500/30 text-emerald-200"
          }`}
        >
          {red ? "Red" : "Green"}
        </span>

        <Labeled label="Time (ms)">
          <NumberInput
            value={p.time}
            step={1}
            onChange={(e) =>
              onUpdate({ time: Math.round(Number(e.target.value) || 0) })
            }
            className="w-24 py-1"
          />
        </Labeled>

        {red ? (
          <>
            <Labeled label="BPM">
              <NumberInput
                value={p.bpm}
                step={0.001}
                min={1}
                onChange={(e) =>
                  onUpdate({ bpm: Math.max(1, Number(e.target.value) || 1) })
                }
                className="w-24 py-1"
              />
            </Labeled>
            <Labeled label="Meter">
              <NumberInput
                value={p.meter}
                step={1}
                min={1}
                max={16}
                onChange={(e) =>
                  onUpdate({
                    meter: Math.max(1, Math.round(Number(e.target.value) || 4)),
                  })
                }
                className="w-16 py-1"
              />
            </Labeled>
          </>
        ) : (
          <>
            <Labeled label="SV ×">
              <NumberInput
                value={p.sv}
                step={0.05}
                min={0.01}
                max={10}
                onChange={(e) =>
                  onUpdate({ sv: clampSv(Number(e.target.value) || 1) })
                }
                className="w-20 py-1"
              />
            </Labeled>
            <div className="flex flex-col">
              <span className="text-[10px] uppercase text-slate-500">Presets</span>
              <div className="flex gap-1">
                {SV_PRESETS.map((sv) => (
                  <MiniButton key={sv} onClick={() => onUpdate({ sv })}>
                    {sv}
                  </MiniButton>
                ))}
              </div>
            </div>
          </>
        )}

        <Labeled label="Vol">
          <NumberInput
            value={p.volume}
            step={1}
            min={0}
            max={100}
            onChange={(e) =>
              onUpdate({
                volume: Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))),
              })
            }
            className="w-16 py-1"
          />
        </Labeled>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="font-mono text-[10px] text-slate-500">
          {formatTime(p.time)}
          {!red && <> · {Math.round(svToBeatLength(p.sv) * 100) / 100}</>}
        </span>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <Toggle
            size="sm"
            checked={p.kiai}
            onChange={(v) => onUpdate({ kiai: v })}
            aria-label="Kiai"
          />
          Kiai
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
          <Toggle
            size="sm"
            checked={p.omitFirstBarline}
            onChange={(v) => onUpdate({ omitFirstBarline: v })}
            aria-label="Omit barline"
          />
          Omit barline
        </div>

        <div className="ml-auto flex gap-1">
          <MiniButton onClick={onMove}>Move here</MiniButton>
          <MiniButton onClick={onDuplicate}>Duplicate</MiniButton>
          <button
            onClick={onDelete}
            disabled={!canDelete}
            className="grid h-6 w-6 place-items-center rounded-lg text-slate-400 transition hover:bg-ink-600 hover:text-red-300 disabled:opacity-30"
            title="Delete timing point"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[10px] uppercase text-slate-500">{label}</span>
      {children}
    </label>
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
