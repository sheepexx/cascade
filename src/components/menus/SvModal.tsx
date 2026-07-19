import { useEffect, useMemo, useRef, useState } from "react";
import {
  MAX_SV,
  MIN_SV,
  clampSv,
  makeGreenPoint,
  type TimingPoint,
} from "../../types";
import { effectiveSvAt, formatTime } from "../../lib/timing";
import { bookmarkLabel, sortedBookmarks } from "../../lib/bookmarks";
import {
  EASING_HANDLES,
  SV_EASINGS,
  applySvToRange,
  buildSvMap,
  constantSv,
  effectiveRateAt,
  type BezierHandles,
  greensInRange,
  rampSv,
  removeGreensInRange,
  stutterLowSv,
  stutterSv,
  type SvEasing,
  type SvMap,
} from "../../lib/sv";
import { BezierEditor } from "../ui/BezierEditor";
import { Modal } from "../ui/Modal";
import { Button, Field, NumberInput, Toggle } from "../ui/Controls";

type Props = {
  open: boolean;
  onClose: () => void;
  timingPoints: TimingPoint[];
  onTimingPoints: (points: TimingPoint[]) => void;
  getCurrentTime: () => number;
  selectionRange: { start: number; end: number; count: number } | null;
  readOnly?: boolean;
  /** Mirrors the editor setting so the preview plots the real scroll rate. */
  bpmScroll?: boolean;
  bookmarks?: number[];
  bookmarkLabels?: Record<string, string>;
};

type Tab = "constant" | "ramp" | "stutter" | "remove";

const TABS: { id: Tab; label: string }[] = [
  { id: "constant", label: "Constant" },
  { id: "ramp", label: "Ramp" },
  { id: "stutter", label: "Stutter" },
  { id: "remove", label: "Remove" },
];

const DENSITIES = [1, 2, 4, 8, 16] as const;

const EASING_LABELS: Record<SvEasing, string> = {
  linear: "Linear",
  sineIn: "Sine in",
  sineOut: "Sine out",
  sineInOut: "Sine in-out",
  quadIn: "Quad in",
  quadOut: "Quad out",
  quadInOut: "Quad in-out",
  expoIn: "Expo in",
  expoOut: "Expo out",
  expoInOut: "Expo in-out",
};

const TAB_HELP: Record<Tab, string> = {
  constant:
    "Holds one scroll speed across the range. 2× makes notes travel twice as fast; 0.5× crawls.",
  ramp: "Glides the scroll speed from one value to another across the range. Pick a curve to shape how quickly it changes.",
  stutter:
    "Bursts fast at the start of each cycle, then slows to compensate, so the chart never drifts out of place. A classic jump-scroll effect.",
  remove: "Deletes every SV point inside the range, returning it to 1× scroll.",
};

export function SvModal({
  open,
  onClose,
  timingPoints,
  onTimingPoints,
  getCurrentTime,
  selectionRange,
  readOnly,
  bpmScroll = false,
  bookmarks,
  bookmarkLabels,
}: Props) {
  const [tab, setTab] = useState<Tab>("constant");
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(2000);
  const [sv, setSv] = useState(2);
  const [svStart, setSvStart] = useState(1);
  const [svEnd, setSvEnd] = useState(2);
  const [easing, setEasing] = useState<BezierHandles>(
    EASING_HANDLES.sineInOut,
  );
  const [density, setDensity] = useState(4);
  const [peakSv, setPeakSv] = useState(1.5);
  const [peakPercent, setPeakPercent] = useState(50);
  const [cycleBeats, setCycleBeats] = useState(1);
  const [restoreAtEnd, setRestoreAtEnd] = useState(true);
  const [applied, setApplied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Prefill the range from the note selection (when it spans something) or
  // from the playhead, each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setApplied(false);
    if (selectionRange && selectionRange.count >= 2) {
      setRangeStart(Math.round(selectionRange.start));
      setRangeEnd(
        Math.round(
          Math.max(selectionRange.end, selectionRange.start + 1),
        ),
      );
      return;
    }
    const now = Math.max(0, Math.round(getCurrentTime()));
    setRangeStart(now);
    setRangeEnd(now + 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const rangeValid = rangeEnd > rangeStart && rangeStart >= 0;

  const generated = useMemo<TimingPoint[]>(() => {
    if (!rangeValid) return [];
    switch (tab) {
      case "constant":
        return constantSv(rangeStart, clampSv(sv));
      case "ramp":
        return rampSv(
          timingPoints,
          rangeStart,
          rangeEnd,
          clampSv(svStart),
          clampSv(svEnd),
          easing,
          density,
        );
      case "stutter":
        return stutterSv(
          timingPoints,
          rangeStart,
          rangeEnd,
          clampSv(peakSv),
          peakPercent / 100,
          cycleBeats,
        );
      case "remove":
        return [];
    }
  }, [
    rangeValid,
    tab,
    timingPoints,
    rangeStart,
    rangeEnd,
    sv,
    svStart,
    svEnd,
    easing,
    density,
    peakSv,
    peakPercent,
    cycleBeats,
  ]);

  const result = useMemo<TimingPoint[]>(() => {
    if (!rangeValid) return timingPoints;
    if (tab === "remove") {
      return removeGreensInRange(timingPoints, rangeStart, rangeEnd);
    }
    const endPoints: TimingPoint[] = [];
    if (restoreAtEnd) {
      endPoints.push(
        makeGreenPoint(rangeEnd, effectiveSvAt(rangeEnd, timingPoints)),
      );
    } else if (tab === "ramp") {
      endPoints.push(makeGreenPoint(rangeEnd, clampSv(svEnd)));
    } else if (tab === "stutter") {
      endPoints.push(makeGreenPoint(rangeEnd, 1));
    }
    return applySvToRange(timingPoints, rangeStart, rangeEnd, [
      ...generated,
      ...endPoints,
    ]);
  }, [
    rangeValid,
    tab,
    timingPoints,
    rangeStart,
    rangeEnd,
    restoreAtEnd,
    svEnd,
    generated,
  ]);

  const replacedCount = useMemo(
    () =>
      rangeValid ? greensInRange(timingPoints, rangeStart, rangeEnd).length : 0,
    [rangeValid, timingPoints, rangeStart, rangeEnd],
  );

  const addedCount =
    tab === "remove"
      ? 0
      : generated.length + (restoreAtEnd || tab !== "constant" ? 1 : 0);

  const stutterLow = stutterLowSv(peakSv, peakPercent / 100);
  const stutterDrifts = tab === "stutter" && stutterLow === MIN_SV;

  // Preview: current SV curve (grey) vs the result (accent), log-scaled Y so
  // 0.5x edits stay visible next to 5x spikes.
  useEffect(() => {
    if (!open || !rangeValid) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 560;
    const cssHeight = 120;
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const pad = (rangeEnd - rangeStart) * 0.1;
    const t0 = rangeStart - pad;
    const t1 = rangeEnd + pad;
    const xOf = (t: number) => ((t - t0) / (t1 - t0)) * cssWidth;

    // Plot the scroll rate the editor actually scrolls at, which folds in BPM
    // when that setting is on. Plotting raw SV would draw a flat line for a
    // BPM-gimmick map whose scroll is anything but flat.
    const opts = { bpmScroll };
    const beforeMap = buildSvMap(timingPoints, opts);
    const afterMap = buildSvMap(result, opts);
    const SAMPLES = 220;
    const sampleAt = (map: SvMap, i: number) =>
      effectiveRateAt(map, t0 + ((t1 - t0) * i) / SAMPLES);

    // Fit the axis to the data (always including 1x) so a gentle 0.9-1.1 ramp
    // is readable instead of squashed flat against the middle.
    let lo = 1;
    let hi = 1;
    for (let i = 0; i <= SAMPLES; i++) {
      for (const v of [sampleAt(beforeMap, i), sampleAt(afterMap, i)]) {
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    lo = Math.max(MIN_SV, lo / 1.35);
    hi = Math.min(100, hi * 1.35);
    const lgLo = Math.log10(lo);
    const lgHi = Math.log10(hi);
    const span = Math.max(0.15, lgHi - lgLo);
    const yOf = (v: number) => {
      const lg = Math.log10(Math.max(MIN_SV, Math.min(100, v)));
      return cssHeight - 6 - ((lg - lgLo) / span) * (cssHeight - 12);
    };

    // Reference lines, only those inside the fitted range.
    for (const v of [0.25, 0.5, 1, 2, 4, 8]) {
      if (v < lo || v > hi) continue;
      const y = yOf(v);
      ctx.strokeStyle =
        v === 1 ? "rgba(148,163,184,0.4)" : "rgba(148,163,184,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(cssWidth, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(148,163,184,0.6)";
      ctx.font = "9px ui-sans-serif, system-ui";
      ctx.fillText(`${v}×`, 4, y - 2);
    }

    // Range bounds.
    ctx.strokeStyle = "rgba(45,212,191,0.35)";
    ctx.setLineDash([4, 3]);
    for (const t of [rangeStart, rangeEnd]) {
      ctx.beginPath();
      ctx.moveTo(xOf(t), 0);
      ctx.lineTo(xOf(t), cssHeight);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const drawCurve = (map: SvMap, style: string, width: number) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.beginPath();
      let prevY: number | null = null;
      for (let i = 0; i <= SAMPLES; i++) {
        const t = t0 + ((t1 - t0) * i) / SAMPLES;
        const y = yOf(effectiveRateAt(map, t));
        const x = xOf(t);
        if (prevY === null) ctx.moveTo(x, y);
        else {
          // Step-style: the rate holds until the next point.
          ctx.lineTo(x, prevY);
          ctx.lineTo(x, y);
        }
        prevY = y;
      }
      ctx.stroke();
    };

    drawCurve(beforeMap, "rgba(148,163,184,0.55)", 1);
    drawCurve(afterMap, "rgba(45,212,191,0.95)", 1.5);
  }, [open, rangeValid, rangeStart, rangeEnd, timingPoints, result, bpmScroll]);

  const apply = () => {
    if (!rangeValid || readOnly) return;
    onTimingPoints(result);
    setApplied(true);
  };

  const bookmarkOptions = useMemo(
    () =>
      sortedBookmarks(bookmarks).map((ms) => ({
        ms,
        label: bookmarkLabel(bookmarkLabels, ms),
      })),
    [bookmarks, bookmarkLabels],
  );

  /** Which preset the handles currently sit on, if any, so the picker can
   *  show "Custom curve" once they have been dragged off one. */
  const matchedPreset = useMemo(() => {
    const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
    return (
      SV_EASINGS.find((id) => {
        const h = EASING_HANDLES[id];
        return (
          near(h.x1, easing.x1) &&
          near(h.y1, easing.y1) &&
          near(h.x2, easing.x2) &&
          near(h.y2, easing.y2)
        );
      }) ?? null
    );
  }, [easing]);

  /** "0:12.345" plus the bookmark name when the time lands on one. */
  const timeHint = (ms: number) => {
    const hit = bookmarkOptions.find((b) => Math.round(b.ms) === Math.round(ms));
    return hit?.label ? `${formatTime(ms)} · ${hit.label}` : formatTime(ms);
  };

  const bookmarkPicker = (onPick: (ms: number) => void, id: string) =>
    bookmarkOptions.length > 0 && (
      <select
        aria-label={`Set ${id} from a bookmark`}
        title="Set from a bookmark"
        value=""
        onChange={(e) => {
          if (e.target.value === "") return;
          onPick(Number(e.target.value));
          setApplied(false);
          e.target.value = "";
        }}
        className="w-9 shrink-0 rounded-lg border border-white/10 bg-ink-700/65 px-1 text-center text-sm text-slate-300 outline-none transition hover:border-accent/50 focus:border-accent/70"
      >
        <option value="">🔖</option>
        {/* Names repeat often, so every entry carries its timestamp. */}
        {bookmarkOptions.map(({ ms, label }) => (
          <option key={ms} value={ms}>
            {formatTime(ms)}
            {label ? ` - ${label}` : ""}
          </option>
        ))}
      </select>
    );

  const svField = (
    label: string,
    value: number,
    onChange: (v: number) => void,
  ) => (
    <Field label={label}>
      <NumberInput
        min={MIN_SV}
        max={MAX_SV}
        step={0.1}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(v);
          setApplied(false);
        }}
      />
    </Field>
  );

  return (
    <Modal open={open} onClose={onClose} title="SV editor" width="max-w-2xl">
      {/* Generators have different control counts; floor the height so the
          preview and Apply button stay put when switching tabs. */}
      <div className="flex min-h-[min(34rem,66vh)] flex-col gap-4">
        <p className="text-[11px] text-slate-500">
          Scroll velocity (SV) changes how fast notes travel without touching
          their timing. Preview follows time-based scroll (like Quaver); turn on
          &ldquo;Preview SV while playing&rdquo; in Settings or press F5 to feel
          it. Undo with Ctrl+Z.
        </p>

        <div className="flex gap-1 rounded-xl border border-ink-500/60 bg-ink-700/40 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setApplied(false);
              }}
              className={`flex-1 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id
                  ? "bg-accent/20 text-accent border border-accent/50"
                  : "text-slate-400 hover:bg-white/5 border border-transparent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-slate-500">{TAB_HELP[tab]}</p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="From (ms)" hint={timeHint(rangeStart)}>
            <div className="flex gap-2">
              <NumberInput
                min={0}
                step={1}
                value={rangeStart}
                className="w-full"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setRangeStart(Math.round(v));
                  setApplied(false);
                }}
              />
              <Button
                onClick={() => {
                  setRangeStart(Math.max(0, Math.round(getCurrentTime())));
                  setApplied(false);
                }}
                title="Set to playhead"
              >
                ⌖
              </Button>
              {bookmarkPicker((ms) => setRangeStart(Math.round(ms)), "from")}
            </div>
          </Field>
          <Field label="To (ms)" hint={timeHint(Math.max(rangeEnd, 0))}>
            <div className="flex gap-2">
              <NumberInput
                min={0}
                step={1}
                value={rangeEnd}
                className="w-full"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setRangeEnd(Math.round(v));
                  setApplied(false);
                }}
              />
              <Button
                onClick={() => {
                  setRangeEnd(Math.max(0, Math.round(getCurrentTime())));
                  setApplied(false);
                }}
                title="Set to playhead"
              >
                ⌖
              </Button>
              {bookmarkPicker((ms) => setRangeEnd(Math.round(ms)), "to")}
            </div>
          </Field>
        </div>
        {selectionRange && selectionRange.count >= 2 && (
          <button
            type="button"
            className="self-start text-[11px] text-accent hover:underline"
            onClick={() => {
              setRangeStart(Math.round(selectionRange.start));
              setRangeEnd(
                Math.round(
                  Math.max(selectionRange.end, selectionRange.start + 1),
                ),
              );
              setApplied(false);
            }}
          >
            Use selection ({selectionRange.count} notes,{" "}
            {formatTime(selectionRange.start)} –{" "}
            {formatTime(selectionRange.end)})
          </button>
        )}
        {!rangeValid && (
          <p className="text-[11px] text-rose-300">
            &ldquo;To&rdquo; must be after &ldquo;From&rdquo;.
          </p>
        )}

        {tab === "constant" && (
          <div className="grid grid-cols-2 gap-3">
            {svField("SV ×", sv, setSv)}
          </div>
        )}

        {tab === "ramp" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {svField("Start SV ×", svStart, setSvStart)}
              {svField("End SV ×", svEnd, setSvEnd)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Curve"
                hint="Drag the two handles, or start from a preset."
              >
                <BezierEditor
                  value={easing}
                  onChange={(v) => {
                    setEasing(v);
                    setApplied(false);
                  }}
                  disabled={!!readOnly}
                />
                <select
                  value={matchedPreset ?? ""}
                  onChange={(e) => {
                    const preset = e.target.value as SvEasing;
                    if (!preset) return;
                    setEasing(EASING_HANDLES[preset]);
                    setApplied(false);
                  }}
                  className="mt-2 rounded-lg border border-white/10 bg-ink-700/65 px-3 py-2 text-sm text-slate-100 outline-none focus:border-accent/70"
                >
                  {!matchedPreset && <option value="">Custom curve</option>}
                  {SV_EASINGS.map((id) => (
                    <option key={id} value={id}>
                      {EASING_LABELS[id]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Point spacing">
                <div className="flex gap-1">
                  {DENSITIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setDensity(d);
                        setApplied(false);
                      }}
                      className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition ${
                        density === d
                          ? "border-accent/60 bg-accent/15 text-accent"
                          : "border-ink-500/60 bg-ink-700/40 text-slate-400 hover:bg-white/5"
                      }`}
                    >
                      1/{d}
                    </button>
                  ))}
                </div>
              </Field>
            </div>
          </>
        )}

        {tab === "stutter" && (
          <div className="grid grid-cols-3 gap-3">
            {svField("Peak SV ×", peakSv, setPeakSv)}
            <Field label="Peak length %">
              <NumberInput
                min={5}
                max={95}
                step={5}
                value={peakPercent}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) {
                    setPeakPercent(Math.max(5, Math.min(95, v)));
                  }
                  setApplied(false);
                }}
              />
            </Field>
            <Field label="Cycle (beats)">
              <NumberInput
                min={0.25}
                max={8}
                step={0.25}
                value={cycleBeats}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v) && v > 0) setCycleBeats(v);
                  setApplied(false);
                }}
              />
            </Field>
            <p className="col-span-3 text-[11px] text-slate-500">
              Each cycle: {peakSv}× for {peakPercent}% of the cycle, then{" "}
              {stutterLow.toFixed(2)}× to catch up.
              {stutterDrifts && (
                <span className="text-amber-300">
                  {" "}
                  Peak too strong to fully compensate — the field will drift
                  forward.
                </span>
              )}
            </p>
          </div>
        )}

        {tab !== "remove" && (
          <div className="flex items-center justify-between text-xs text-slate-300">
            <span>Return to previous SV at end of range</span>
            <Toggle
              checked={restoreAtEnd}
              onChange={(v) => {
                setRestoreAtEnd(v);
                setApplied(false);
              }}
              aria-label="Return to previous SV at end of range"
            />
          </div>
        )}

        <div className="rounded-xl border border-ink-500/60 bg-ink-800/60 p-2">
          <canvas ref={canvasRef} className="block h-[120px] w-full" />
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 bg-slate-400/60" />
              current
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 bg-teal-400" />
              after apply
            </span>
            <span className="text-slate-600">
              scroll rate {bpmScroll ? "including BPM" : "from SV only"}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[11px] text-slate-500">
            {tab === "remove"
              ? `Removes ${replacedCount} SV point${replacedCount === 1 ? "" : "s"} in range.`
              : `Replaces ${replacedCount} SV point${replacedCount === 1 ? "" : "s"} with ${addedCount}.`}
            {applied && (
              <span className="ml-2 text-emerald-300">Applied ✓</span>
            )}
          </span>
          <Button
            variant="accent"
            disabled={!rangeValid || !!readOnly}
            onClick={apply}
          >
            {tab === "remove" ? "Remove SV" : "Apply SV"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
