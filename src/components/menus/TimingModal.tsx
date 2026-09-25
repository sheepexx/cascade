import { memo, useEffect, useRef, useState } from "react";
import { CloseIcon } from "../ui/Icons";
import {
  clampSv,
  makeGreenPoint,
  makeRedPoint,
  svToBeatLength,
  uid,
  type TimingPoint,
} from "../../types";
import { useTapTempo } from "../../hooks/useTapTempo";
import { useMetronome } from "../../hooks/useMetronome";
import { formatTime, sortedPoints } from "../../lib/timing";
import { detectBpmFromBuffer, type BpmDetection } from "../../lib/bpmDetect";
import { Modal } from "../ui/Modal";
import {
  Button,
  Field,
  NumberInput,
  PrecisionNumberInput,
  SegmentedControl,
  Toggle,
} from "../ui/Controls";
import { formatUiNumber } from "../../lib/formatUiNumber";
import { InfoTip } from "../ui/Tooltip";
import { useT } from "../../lib/i18n";

type Props = {
  open: boolean;
  onClose: () => void;
  timingPoints: TimingPoint[];
  onTimingPoints: (points: TimingPoint[]) => void;
  isPlaying: boolean;
  playbackRate: number;
  getCurrentTime: () => number;
  onToggle: () => void;
  onSetPlaybackRate: (rate: number) => void;
  audioBuffer: AudioBuffer | null;
  /** Rate of the active difficulty; detection runs in audio-file time. */
  timeScale: number;
  /** Preview point of the active difficulty, or -1 when it is unset. */
  previewTime: number;
  /** Omitted for viewers, who cannot change the map. */
  onPreviewTime?: (ms: number) => void;
  onShiftMarkers?: (deltaMs: number) => void;
  /** Whether timing edits carry the notes along with them. */
  moveNotes?: boolean;
  /** Omitted for viewers, who cannot change the map. */
  onMoveNotes?: (value: boolean) => void;
  /** Reports the selected rows so the bottom timeline can highlight them. */
  onSelectionChange?: (ids: ReadonlySet<string>) => void;
};

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1] as const;
const OFFSET_NUDGES = [-10, -5, -1, 1, 5, 10] as const;
const SV_PRESETS = [0.5, 0.75, 1, 1.5, 2] as const;
const TAP_MIN = 3;

const CARD = "rounded-xl border border-white/10 bg-ink-700/40 p-4";
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-slate-400";

type Pane = "points" | "bpm";

export const TimingModal = memo(function TimingModal({
  open,
  onClose,
  timingPoints,
  onTimingPoints,
  isPlaying,
  playbackRate,
  getCurrentTime,
  onToggle,
  onSetPlaybackRate,
  audioBuffer,
  timeScale,
  previewTime,
  onPreviewTime,
  onShiftMarkers,
  moveNotes = false,
  onMoveNotes,
  onSelectionChange,
}: Props) {
  const t = useT();
  const { tap, reset, bpm, offset, count } = useTapTempo(getCurrentTime);
  const [pane, setPane] = useState<Pane>("points");
  const [metronomeOn, setMetronomeOn] = useState(true);
  const [tapApplied, setTapApplied] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detection, setDetection] = useState<BpmDetection | "failed" | null>(
    null,
  );
  const [detectApplied, setDetectApplied] = useState(false);
  const [pointTab, setPointTab] = useState<"red" | "green">("red");
  const [expandedPointId, setExpandedPointId] = useState<string | null>(null);
  const [selectedPointIds, setSelectedPointIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedPointShift, setSelectedPointShift] = useState(0);
  const [markerShift, setMarkerShift] = useState(0);

  useEffect(() => {
    onSelectionChange?.(selectedPointIds);
  }, [selectedPointIds, onSelectionChange]);

  useEffect(() => {
    setDetection(null);
    setDetectApplied(false);
  }, [audioBuffer, timeScale]);
  const [beat, setBeat] = useState<{ index: number; meter: number; n: number } | null>(
    null,
  );

  useMetronome(
    getCurrentTime,
    isPlaying,
    timingPoints,
    open && metronomeOn,
    ({ beat: b, meter }) => {
      const index = ((b % meter) + meter) % meter;
      setBeat((prev) => ({ index, meter, n: (prev?.n ?? 0) + 1 }));
    },
  );

  useEffect(() => {
    if (!isPlaying || !metronomeOn) setBeat(null);
  }, [isPlaying, metronomeOn]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.code !== "Space" && e.key !== " ")) return;
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
      onToggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onToggle]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.key !== "t" && e.key !== "T")) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        t?.isContentEditable
      )
        return;
      e.preventDefault();
      tap();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, tap]);

  const points = sortedPoints(timingPoints);
  const reds = points.filter((p) => p.uninherited);
  const visiblePoints = points.filter((p) =>
    pointTab === "red" ? p.uninherited : !p.uninherited,
  );
  const firstRed = reds[0] ?? null;
  const meter = Math.max(
    1,
    Math.round(beat?.meter ?? firstRed?.meter ?? 4),
  );

  const update = (id: string, patch: Partial<TimingPoint>) =>
    onTimingPoints(
      timingPoints.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    );

  const remove = (id: string) => {
    const p = timingPoints.find((x) => x.id === id);
    if (p?.uninherited && reds.length <= 1) return;
    onTimingPoints(timingPoints.filter((x) => x.id !== id));
  };

  const addRed = () => {
    const t = Math.round(getCurrentTime());
    const base = [...reds].reverse().find((p) => p.time <= t) ?? firstRed;
    onTimingPoints([
      ...timingPoints,
      makeRedPoint(t, base?.bpm ?? 120, {
        meter: base?.meter ?? 4,
        volume: base?.volume ?? 100,
      }),
    ]);
    setPointTab("red");
  };

  const addGreen = () => {
    const t = Math.round(getCurrentTime());
    const prevGreen = [...points].reverse().find((p) => !p.uninherited && p.time <= t);
    onTimingPoints([
      ...timingPoints,
      makeGreenPoint(t, prevGreen?.sv ?? 1, {
        volume: prevGreen?.volume ?? 100,
      }),
    ]);
    setPointTab("green");
  };

  const duplicate = (id: string) => {
    const p = timingPoints.find((x) => x.id === id);
    if (!p) return;
    onTimingPoints([
      ...timingPoints,
      { ...p, id: uid("tp"), time: Math.round(getCurrentTime()) },
    ]);
  };

  const moveToPlayhead = (id: string) =>
    update(id, { time: Math.round(getCurrentTime()) });

  const togglePointSelection = (id: string) =>
    setSelectedPointIds((selected) => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const shiftSelectedPoints = (delta: number) => {
    if (!delta || !selectedPointIds.size) return;
    onTimingPoints(
      timingPoints.map((point) =>
        selectedPointIds.has(point.id)
          ? { ...point, time: point.time + delta }
          : point,
      ),
    );
  };

  const setOffset = () => {
    if (!firstRed) return;
    update(firstRed.id, { time: Math.round(getCurrentTime()) });
  };

  const nudgeOffset = (delta: number) => {
    if (!firstRed) return;
    update(firstRed.id, { time: Math.round(firstRed.time + delta) });
  };

  const applyTap = (targetBpm: number, targetOffset: number) => {
    const time = Math.round(targetOffset);
    const target = [...reds].reverse().find((p) => p.time <= time) ?? firstRed;
    if (target) update(target.id, { bpm: targetBpm, time });
  };
  const applyTapRef = useRef(applyTap);
  applyTapRef.current = applyTap;

  const resetTaps = () => {
    reset();
    setTapApplied(false);
  };

  const runDetect = () => {
    if (!audioBuffer || detecting) return;
    setDetecting(true);
    setDetection(null);
    setDetectApplied(false);
    // Detection scans the whole file on the main thread; let the button's
    // "Listening..." state paint before blocking.
    window.setTimeout(() => {
      let result: BpmDetection | "failed" = "failed";
      try {
        const raw = detectBpmFromBuffer(audioBuffer);
        if (raw) {
          // Detection runs in audio-file time; a rate-changed difficulty
          // hears the song timeScale× faster, so its BPM scales up and its
          // offsets shrink by the same factor.
          result = {
            bpm: Math.round(raw.bpm * timeScale * 1000) / 1000,
            offsetMs: Math.round(raw.offsetMs / timeScale),
            confidence: raw.confidence,
          };
        }
      } catch {
        result = "failed";
      }
      setDetection(result);
      setDetecting(false);
    }, 30);
  };

  const applyDetection = () => {
    if (detection === null || detection === "failed") return;
    applyTap(detection.bpm, detection.offsetMs);
    setDetectApplied(true);
  };

  useEffect(() => {
    if (bpm === null || offset === null || count < TAP_MIN) return;
    const id = window.setTimeout(() => {
      applyTapRef.current(bpm, offset);
      setTapApplied(true);
    }, 500);
    return () => window.clearTimeout(id);
  }, [bpm, offset, count]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("nav.timing")}
      width="max-w-2xl"
      height="h-[36rem]"
      modeless
      footer={
        pane === "points" ? (
          <>
            <span className="mr-auto self-center text-[11px] text-slate-500">
              {t("timing.addedAtPlayhead")}
            </span>
            <Button onClick={addRed}>{t("timing.addUninherited")}</Button>
            <Button variant="accent" onClick={addGreen}>
              {t("timing.addInherited")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <Transport
          isPlaying={isPlaying}
          onToggle={onToggle}
          playbackRate={playbackRate}
          onSetPlaybackRate={onSetPlaybackRate}
          metronomeOn={metronomeOn}
          onMetronome={setMetronomeOn}
          meter={meter}
          beatIndex={beat?.index ?? null}
        />

        <SegmentedControl
          value={pane}
          onChange={setPane}
          options={[
            { value: "points", label: t("timing.pointsTab", { count: points.length }) },
            { value: "bpm", label: t("timing.findBpm") },
          ]}
        />

        {pane === "points" ? (
          <>
            <section className={CARD}>
              <div className="flex items-baseline justify-between gap-3">
                <span className={LABEL}>{t("timing.offset")}</span>
                <span className="font-mono text-xs text-slate-300">
                  {firstRed
                    ? `${firstRed.time} ms · ${formatTime(firstRed.time)}`
                    : "-"}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                {t("timing.offsetHint")}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button onClick={setOffset} variant="primary">
                  {t("timing.setToPlayhead")}
                </Button>
                <Nudges onNudge={nudgeOffset} />
              </div>
              {onMoveNotes && (
                <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                  <label className="flex items-center gap-2">
                    <Toggle
                      size="sm"
                      checked={moveNotes}
                      onChange={onMoveNotes}
                      aria-label={t("settings.moveNotesWithTiming")}
                    />
                    {t("settings.moveNotesWithTiming")}
                  </label>
                  <InfoTip content={t("settings.moveNotesWithTimingHint")} />
                </div>
              )}

              {onShiftMarkers && (
                <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-white/10 pt-4">
                  <Field label={t("timing.shiftEverything")}>
                    <NumberInput
                      value={markerShift}
                      step={1}
                      onChange={(e) => setMarkerShift(Number(e.target.value) || 0)}
                      className="w-28"
                    />
                  </Field>
                  <Button
                    disabled={!markerShift}
                    onClick={() => {
                      onShiftMarkers(markerShift);
                      setMarkerShift(0);
                    }}
                  >
                    {moveNotes ? t("timing.shiftAllWithNotes") : t("timing.shiftAll")}
                  </Button>
                </div>
              )}
            </section>

            {onPreviewTime && (
              <section className={CARD}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className={LABEL}>
                    <span className="text-purple-300">◆</span> {t("timing.previewPoint")}
                  </span>
                  <span className="font-mono text-xs text-slate-300">
                    {previewTime >= 0
                      ? `${Math.round(previewTime)} ms · ${formatTime(previewTime)}`
                      : t("timing.notSet")}
                  </span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  {t("timing.previewHint")}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    variant="primary"
                    onClick={() => onPreviewTime(getCurrentTime())}
                  >
                    {t("timing.setPreview")}
                  </Button>
                  <Button
                    disabled={previewTime < 0}
                    onClick={() => onPreviewTime(-1)}
                  >
                    {t("timing.clear")}
                  </Button>
                </div>
              </section>
            )}

            <SegmentedControl
              value={pointTab}
              onChange={(kind) => {
                setPointTab(kind);
                setExpandedPointId(null);
              }}
              options={[
                { value: "red", label: t("timing.uninheritedTab", { count: reds.length }) },
                {
                  value: "green",
                  label: t("timing.inheritedTab", { count: points.length - reds.length }),
                },
              ]}
            />

            <p className="text-[11px] leading-snug text-slate-500">
              {pointTab === "red"
                ? t("timing.uninheritedHint")
                : t("timing.inheritedHint")}
            </p>

            {selectedPointIds.size > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-slate-300">
                <span className="font-medium">
                  {t("editor.selected", { count: selectedPointIds.size })}
                </span>
                <Nudges onNudge={shiftSelectedPoints} />
                <NumberInput
                  value={selectedPointShift}
                  step={1}
                  onChange={(event) =>
                    setSelectedPointShift(Number(event.target.value) || 0)
                  }
                  className="w-20 py-1"
                  aria-label={t("timing.selectedShiftLabel")}
                />
                <Button
                  className="px-2 py-1 text-xs"
                  onClick={() => {
                    shiftSelectedPoints(selectedPointShift);
                    setSelectedPointShift(0);
                  }}
                >
                  {t("timing.shift")}
                </Button>
                <button
                  type="button"
                  onClick={() => setSelectedPointIds(new Set())}
                  className="ml-auto text-[11px] text-slate-500 transition duration-[var(--motion-quick)] hover:text-slate-300"
                >
                  {t("timing.clear")}
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {visiblePoints.length === 0 ? (
                <p className="rounded-xl border border-white/10 bg-ink-700/40 px-3 py-6 text-center text-xs text-slate-500">
                  {pointTab === "red" ? t("timing.noUninherited") : t("timing.noInherited")}
                </p>
              ) : (
                visiblePoints.map((p, i) => (
                  <PointRow
                    key={p.id}
                    point={p}
                    index={i + 1}
                    expanded={expandedPointId === p.id}
                    selected={selectedPointIds.has(p.id)}
                    onExpand={() =>
                      setExpandedPointId((id) => (id === p.id ? null : p.id))
                    }
                    onSelect={() => togglePointSelection(p.id)}
                    canDelete={!(p.uninherited && reds.length <= 1)}
                    onUpdate={(patch) => update(p.id, patch)}
                    onDelete={() => remove(p.id)}
                    onDuplicate={() => duplicate(p.id)}
                    onMove={() => moveToPlayhead(p.id)}
                  />
                ))
              )}
            </div>
          </>
        ) : (
          <>
            <section className={CARD}>
              <div className="flex items-center gap-1.5">
                <span className={LABEL}>{t("timing.tapTitle")}</span>
                <InfoTip
                  content={
                    <>
                      <p className="m-0">
                        {t("timing.tapHint1")}
                      </p>
                      <p className="mt-2">
                        {t("timing.tapHint2")}
                      </p>
                    </>
                  }
                />
              </div>

              <div className="mt-4 flex items-center gap-4">
                <button
                  type="button"
                  onClick={tap}
                  data-no-uisound=""
                  className="relative grid h-24 w-24 shrink-0 select-none place-items-center overflow-visible rounded-full bg-accent text-sm font-semibold text-white transition duration-[var(--motion-quick)] active:scale-95 active:bg-accent-soft"
                >
                  {count > 0 && (
                    <span
                      key={count}
                      className="tap-ring pointer-events-none absolute inset-0 rounded-full border-2 border-accent"
                    />
                  )}
                  {t("timing.tap")}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="font-mono text-3xl leading-none text-slate-100">
                    {bpm !== null ? bpm.toFixed(2) : "-"}
                    <span className="ml-1.5 text-sm text-slate-500">BPM</span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {t("timing.tapCount", { count })}
                    {offset !== null && <> · {t("timing.offsetApprox", { ms: Math.round(offset) })}</>}
                    {count > 0 && count < TAP_MIN && (
                      <> · {t("timing.moreToLock", { count: TAP_MIN - count })}</>
                    )}
                  </div>
                  {tapApplied && (
                    <div className="mt-1 text-xs font-medium text-emerald-400">
                      ✓ {t("timing.appliedToTiming")}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={resetTaps} disabled={count === 0}>
                      {t("common.reset")}
                    </Button>
                    <Button
                      variant="accent"
                      onClick={() => {
                        if (bpm !== null && offset !== null) {
                          applyTap(bpm, offset);
                          setTapApplied(true);
                        }
                      }}
                      disabled={bpm === null}
                    >
                      {t("timing.applyNow")}
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            <section className={CARD}>
              <div className="flex items-center gap-1.5">
                <span className={LABEL}>{t("timing.detectTitle")}</span>
                <InfoTip content={t("timing.detectInfo")} />
              </div>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                {!audioBuffer
                  ? t("timing.loadAudioFirst")
                  : t("timing.detectHint")}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  variant="accent"
                  onClick={runDetect}
                  disabled={!audioBuffer || detecting}
                >
                  {detecting ? t("timing.listening") : t("timing.detectBpm")}
                </Button>
                {detection === "failed" && (
                  <span className="text-xs text-rose-300">
                    {t("timing.noSteadyBeat")}
                  </span>
                )}
                {detection !== null && detection !== "failed" && (
                  <>
                    <span className="font-mono text-sm text-slate-100">
                      {t("timing.detectResult", { bpm: formatUiNumber(detection.bpm), ms: formatUiNumber(detection.offsetMs) })}
                    </span>
                    <Confidence value={detection.confidence} />
                    <Button variant="primary" onClick={applyDetection}>
                      {t("common.apply")}
                    </Button>
                    {detectApplied && (
                      <span className="text-xs font-medium text-emerald-400">
                        ✓ {t("timing.applied")}
                      </span>
                    )}
                  </>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </Modal>
  );
});

/** Playback rate, metronome and the beat lights, on one strip above the tabs
 *  because both panes are worked with the song running. */
function Transport({
  isPlaying,
  onToggle,
  playbackRate,
  onSetPlaybackRate,
  metronomeOn,
  onMetronome,
  meter,
  beatIndex,
}: {
  isPlaying: boolean;
  onToggle: () => void;
  playbackRate: number;
  onSetPlaybackRate: (rate: number) => void;
  metronomeOn: boolean;
  onMetronome: (on: boolean) => void;
  meter: number;
  beatIndex: number | null;
}) {
  const t = useT();
  return (
    <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-white/10 bg-ink-700/40 px-3 py-2.5">
      <button
        type="button"
        onClick={onToggle}
        title={t("timing.spaceKey")}
        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-ink-600/70 px-3 py-1.5 text-xs font-medium text-slate-200 transition duration-[var(--motion-quick)] hover:bg-ink-500/80 active:scale-[0.98]"
      >
        <span className="inline-flex w-14 justify-center">
          {isPlaying ? `❚❚ ${t("nowPlaying.pause")}` : `▶ ${t("nowPlaying.play")}`}
        </span>
        <span className="text-[10px] text-slate-500">{t("timing.spaceKey")}</span>
      </button>

      <div className="flex items-center gap-1.5">
        {PLAYBACK_RATES.map((rate) => {
          const active = Math.abs(playbackRate - rate) < 0.001;
          return (
            <button
              key={rate}
              type="button"
              onClick={() => onSetPlaybackRate(rate)}
              aria-pressed={active}
              className={`rounded-lg border px-2 py-1 text-[11px] font-semibold tabular-nums transition duration-[var(--motion-quick)] active:scale-95 ${
                active
                  ? "border-accent/60 bg-accent/90 text-white"
                  : "border-white/10 bg-ink-700/60 text-slate-300 hover:bg-ink-600 hover:text-slate-100"
              }`}
            >
              {Math.round(rate * 100)}%
            </button>
          );
        })}
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-300">
        <Toggle
          size="sm"
          checked={metronomeOn}
          onChange={onMetronome}
          aria-label={t("timing.metronome")}
        />
        {t("timing.metronome")}
      </label>

      <div className="ml-auto flex items-center gap-1.5" aria-hidden>
        {Array.from({ length: meter }).map((_, i) => {
          const active = beatIndex === i;
          const colour = i === 0 ? "#ffffff" : "#ff9d4d";
          return (
            <span
              key={i}
              className="h-5 w-5 rounded-md border transition-all duration-150 ease-out"
              style={{
                backgroundColor: active ? colour : "transparent",
                borderColor: active ? colour : "#33333f",
                opacity: active ? 1 : 0.35,
                transform: active ? "scale(1.1)" : "scale(1)",
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

function Nudges({ onNudge }: { onNudge: (delta: number) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-white/10">
      {OFFSET_NUDGES.map((delta) => (
        <button
          key={delta}
          type="button"
          onClick={() => onNudge(delta)}
          className="bg-ink-700/60 px-2 py-1 text-[11px] font-medium tabular-nums text-slate-300 transition duration-[var(--motion-quick)] hover:bg-ink-600 hover:text-slate-100"
        >
          {delta > 0 ? `+${delta}` : delta}
        </button>
      ))}
    </div>
  );
}

function Confidence({ value }: { value: number }) {
  const t = useT();
  const [label, tone] =
    value >= 0.5
      ? [t("timing.confident"), "text-emerald-400"]
      : value >= 0.3
        ? [t("timing.plausible"), "text-amber-300"]
        : [t("timing.uncertain"), "text-rose-300"];
  return <span className={`text-[11px] ${tone}`}>{label}</span>;
}

function PointRow({
  point: p,
  index,
  expanded,
  selected,
  onExpand,
  onSelect,
  canDelete,
  onUpdate,
  onDelete,
  onDuplicate,
  onMove,
}: {
  point: TimingPoint;
  index: number;
  expanded: boolean;
  selected: boolean;
  onExpand: () => void;
  onSelect: () => void;
  canDelete: boolean;
  onUpdate: (patch: Partial<TimingPoint>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMove: () => void;
}) {
  const t = useT();
  const red = p.uninherited;
  return (
    <div
      className={`overflow-hidden rounded-xl border transition-colors duration-[var(--motion-quick)] ${
        red
          ? selected
            ? "border-rose-400/70 bg-rose-950/30"
            : "border-white/10 bg-ink-700/40 hover:border-rose-400/40"
          : selected
            ? "border-emerald-400/70 bg-emerald-950/30"
            : "border-white/10 bg-ink-700/40 hover:border-emerald-400/40"
      }`}
    >
      <div
        className="flex cursor-pointer select-none items-center gap-2.5 px-3 py-2"
        onClick={(event) => {
          // The checkbox and Edit button handle their own clicks.
          if ((event.target as HTMLElement).closest("button, input, label"))
            return;
          onSelect();
        }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          aria-label={t("timing.selectPoint", { index })}
          className="h-3.5 w-3.5 accent-accent"
        />
        <span
          aria-hidden
          className={`h-6 w-1 shrink-0 rounded-full ${
            red ? "bg-rose-400" : "bg-emerald-400"
          }`}
        />
        <span className="w-20 shrink-0 font-mono text-xs text-slate-200">
          {formatTime(p.time)}
        </span>
        <span
          className={`shrink-0 text-xs font-medium ${
            red ? "text-rose-200" : "text-emerald-200"
          }`}
        >
          {red
            ? `${formatUiNumber(p.bpm)} BPM · ${p.meter}/4`
            : `${formatUiNumber(p.sv)}× SV`}
        </span>
        <span className="text-[10px] text-slate-500">{t("timing.volShort", { volume: p.volume })}</span>
        {p.kiai && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-200">
            Kiai
          </span>
        )}
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={expanded}
          className="ml-auto shrink-0 rounded-md px-2 py-1 text-[10px] text-slate-400 transition duration-[var(--motion-quick)] hover:bg-white/10 hover:text-slate-200"
        >
          {expanded ? t("common.close") : t("common.edit")}
        </button>
      </div>

      {expanded && (
        <div className="flex flex-col gap-3 border-t border-white/10 bg-ink-800/40 px-3 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t("timing.timeMs")}>
              <NumberInput
                value={p.time}
                step={0.001}
                onChange={(e) => onUpdate({ time: Number(e.target.value) || 0 })}
                className="w-28 py-1.5"
              />
            </Field>

            {red ? (
              <>
                <Field label="BPM">
                  <PrecisionNumberInput
                    value={p.bpm}
                    step={0.01}
                    min={1}
                    onValueChange={(value) =>
                      onUpdate({ bpm: Math.max(1, value || 1) })
                    }
                    className="w-24 py-1.5"
                  />
                </Field>
                <Field label={t("timing.meter")}>
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
                    className="w-16 py-1.5"
                  />
                </Field>
              </>
            ) : (
              <>
                <Field label="SV ×">
                  <PrecisionNumberInput
                    value={p.sv}
                    step={0.05}
                    min={0.01}
                    max={10}
                    onValueChange={(value) => onUpdate({ sv: clampSv(value || 1) })}
                    className="w-20 py-1.5"
                  />
                </Field>
                <Field label={t("nav.presets")}>
                  <div className="flex gap-1">
                    {SV_PRESETS.map((sv) => (
                      <button
                        key={sv}
                        type="button"
                        onClick={() => onUpdate({ sv })}
                        className="rounded-lg border border-white/10 bg-ink-700/60 px-2 py-1.5 text-[11px] tabular-nums text-slate-300 transition duration-[var(--motion-quick)] hover:bg-ink-600 hover:text-slate-100"
                      >
                        {sv}
                      </button>
                    ))}
                  </div>
                </Field>
              </>
            )}

            <Field label={t("settings.volume")}>
              <NumberInput
                value={p.volume}
                step={1}
                min={0}
                max={100}
                onChange={(e) =>
                  onUpdate({
                    volume: Math.max(
                      0,
                      Math.min(100, Math.round(Number(e.target.value) || 0)),
                    ),
                  })
                }
                className="w-16 py-1.5"
              />
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-3">
            <span className="font-mono text-[10px] text-slate-500">
              {formatTime(p.time)}
              {!red && <> · {Math.round(svToBeatLength(p.sv) * 100) / 100}</>}
            </span>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <Toggle
                size="sm"
                checked={p.kiai}
                onChange={(v) => onUpdate({ kiai: v })}
                aria-label="Kiai"
              />
              Kiai
            </label>
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <Toggle
                size="sm"
                checked={p.omitFirstBarline}
                onChange={(v) => onUpdate({ omitFirstBarline: v })}
                aria-label={t("timing.omitBarline")}
              />
              {t("timing.omitBarline")}
            </label>

            <div className="ml-auto flex items-center gap-1.5">
              <Button className="px-2 py-1 text-xs" onClick={onMove}>
                {t("timing.moveHere")}
              </Button>
              <Button className="px-2 py-1 text-xs" onClick={onDuplicate}>
                {t("common.duplicate")}
              </Button>
              <button
                type="button"
                onClick={onDelete}
                disabled={!canDelete}
                title={
                  canDelete
                    ? t("timing.deletePoint")
                    : t("timing.cannotDeleteLast")
                }
                className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 transition duration-[var(--motion-quick)] hover:bg-rose-500/15 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <CloseIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
