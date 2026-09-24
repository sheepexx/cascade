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
  clampCurveHandles,
  constantSv,
  curveSv,
  defaultSvCurve,
  effectiveRateAt,
  greensInRange,
  normalizationSv,
  removeGreensInRange,
  stutterLowSv,
  stutterSv,
  type SvEasing,
  type SvKeyframe,
  type SvMap,
} from "../../lib/sv";
import { CurveEditor } from "../ui/CurveEditor";
import { Modal } from "../ui/Modal";
import {
  Button,
  Field,
  NumberInput,
  PrecisionNumberInput,
  SegmentedControl,
  Toggle,
} from "../ui/Controls";
import { Dropdown } from "../ui/Dropdown";
import { Menu } from "../ui/Menu";
import { BookmarkIcon } from "../ui/Icons";
import { FONT_STACK } from "../../lib/fontStack";
import { InfoTip } from "../ui/Tooltip";
import { useT, type MessageKey, type Translate } from "../../lib/i18n";

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

type Tab = "constant" | "curve" | "stutter" | "normalize" | "remove";

const TABS: { value: Tab; label: MessageKey }[] = [
  { value: "constant", label: "sv.tabConstant" },
  { value: "curve", label: "sv.tabCurve" },
  { value: "stutter", label: "sv.tabStutter" },
  { value: "normalize", label: "sv.tabNormalize" },
  { value: "remove", label: "sv.tabRemove" },
];

const DENSITIES = [1, 2, 4, 8, 16] as const;

const CARD = "rounded-xl border border-white/10 bg-ink-700/40 p-4";
const LABEL = "text-[11px] font-semibold uppercase tracking-wide text-slate-400";

const EASING_PARTS: Record<SvEasing, [string, "in" | "out" | "inOut"] | null> = {
  linear: null,
  sineIn: ["Sine", "in"],
  sineOut: ["Sine", "out"],
  sineInOut: ["Sine", "inOut"],
  quadIn: ["Quad", "in"],
  quadOut: ["Quad", "out"],
  quadInOut: ["Quad", "inOut"],
  expoIn: ["Expo", "in"],
  expoOut: ["Expo", "out"],
  expoInOut: ["Expo", "inOut"],
};

function easingLabel(id: SvEasing, t: Translate): string {
  const parts = EASING_PARTS[id];
  if (!parts) return t("sv.easeLinear");
  const [curve, kind] = parts;
  return kind === "in"
    ? t("sv.easeIn", { curve })
    : kind === "out"
      ? t("sv.easeOut", { curve })
      : t("sv.easeInOut", { curve });
}

const TAB_HELP: Record<Tab, MessageKey> = {
  constant: "sv.helpConstant",
  curve: "sv.helpCurve",
  stutter: "sv.helpStutter",
  normalize: "sv.helpNormalize",
  remove: "sv.helpRemove",
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
  const t = useT();
  const [tab, setTab] = useState<Tab>("constant");
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(2000);
  const [sv, setSv] = useState(2);
  const [keyframes, setKeyframes] = useState<SvKeyframe[]>(() =>
    defaultSvCurve(1, 2, EASING_HANDLES.sineInOut),
  );
  const [selectedKf, setSelectedKf] = useState(0);
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
      case "curve":
        return curveSv(
          timingPoints,
          rangeStart,
          rangeEnd,
          keyframes,
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
      case "normalize":
        return normalizationSv(timingPoints, rangeStart, rangeEnd);
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
    keyframes,
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
    } else if (tab === "curve") {
      endPoints.push(
        makeGreenPoint(rangeEnd, clampSv(keyframes[keyframes.length - 1].sv)),
      );
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
    keyframes,
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
      ctx.font = `9px ${FONT_STACK}`;
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

  const rangeSpan = Math.max(1, rangeEnd - rangeStart);
  const safeSelectedKf = Math.min(
    Math.max(0, selectedKf),
    keyframes.length - 1,
  );
  const selectedKfValue = keyframes[safeSelectedKf] ?? keyframes[0];
  const isEdgeKf =
    safeSelectedKf === 0 || safeSelectedKf === keyframes.length - 1;

  const patchSelectedKf = (patch: Partial<SvKeyframe>) => {
    setKeyframes((kfs) =>
      clampCurveHandles(
        kfs.map((kf, i) => (i === safeSelectedKf ? { ...kf, ...patch } : kf)),
      ),
    );
    setApplied(false);
  };

  /** Which preset the curve currently matches, if any, so the picker can show
   *  "Custom curve" once keyframes have been added or dragged off one. */
  const matchedPreset = useMemo(() => {
    if (keyframes.length !== 2) return null;
    const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
    const [a, b] = keyframes;
    const dy = b.sv - a.sv;
    if (Math.abs(dy) < 1e-6) return null;
    return (
      SV_EASINGS.find((id) => {
        const h = EASING_HANDLES[id];
        return (
          near(h.x1, a.out.x) &&
          near(h.y1 * dy, a.out.y) &&
          near(h.x2 - 1, b.in.x) &&
          near((h.y2 - 1) * dy, b.in.y)
        );
      }) ?? null
    );
  }, [keyframes]);

  /** "0:12.345" plus the bookmark name when the time lands on one. */
  const timeHint = (ms: number) => {
    const hit = bookmarkOptions.find((b) => Math.round(b.ms) === Math.round(ms));
    return hit?.label ? `${formatTime(ms)} · ${hit.label}` : formatTime(ms);
  };

  /** The same popover as the editor's File menu, listing every bookmark. */
  const bookmarkPicker = (onPick: (ms: number) => void, id: string) =>
    bookmarkOptions.length > 0 ? (
      <Menu
        className="shrink-0 rounded-lg border border-white/10 bg-ink-700/65 !px-2 !py-2"
        label={
          <span aria-label={id === "from" ? t("sv.fromBookmarkFrom") : t("sv.fromBookmarkTo")} title={t("sv.fromBookmark")}>
            <BookmarkIcon className="block h-5 w-5 text-slate-300" />
          </span>
        }
        // Names repeat often, so every entry carries its timestamp.
        items={bookmarkOptions.map(({ ms, label }) => ({
          label: formatTime(ms),
          hint: label || undefined,
          onClick: () => {
            onPick(Math.round(ms));
            setApplied(false);
          },
        }))}
      />
    ) : null;

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

  const rangeField = (
    label: string,
    value: number,
    onChange: (ms: number) => void,
    id: string,
  ) => (
    <Field label={label} hint={timeHint(Math.max(value, 0))}>
      <div className="flex gap-2">
        <NumberInput
          min={0}
          step={1}
          value={value}
          className="w-full"
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(Math.round(v));
            setApplied(false);
          }}
        />
        <Button
          className="shrink-0"
          title={t("timing.setToPlayhead")}
          onClick={() => {
            onChange(Math.max(0, Math.round(getCurrentTime())));
            setApplied(false);
          }}
        >
          ⌖
        </Button>
        {bookmarkPicker(onChange, id)}
      </div>
    </Field>
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("sv.title")}
      width="max-w-2xl"
      height="h-[38rem]"
      modeless
      footer={
        <>
          <span className="mr-auto self-center text-[11px] text-slate-500">
            {tab === "remove"
              ? t("sv.removes", { count: replacedCount })
              : t("sv.replaces", { count: replacedCount, added: addedCount })}
            {applied && <span className="ml-2 text-emerald-300">{t("timing.applied")} ✓</span>}
          </span>
          <Button
            variant="accent"
            disabled={!rangeValid || !!readOnly}
            onClick={apply}
          >
            {tab === "remove" ? t("sv.removeSv") : t("sv.applySv")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SegmentedControl
          value={tab}
          onChange={(next) => {
            setTab(next);
            setApplied(false);
          }}
          options={TABS.map((entry) => ({ value: entry.value, label: t(entry.label) }))}
        />

        <section className={CARD}>
          <div className="flex items-center gap-1.5">
            <span className={LABEL}>{t("sv.range")}</span>
            <InfoTip content={t("sv.rangeInfo")} />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {rangeField(t("sv.fromMs"), rangeStart, setRangeStart, "from")}
            {rangeField(t("sv.toMs"), rangeEnd, setRangeEnd, "to")}
          </div>

          {selectionRange && selectionRange.count >= 2 && (
            <button
              type="button"
              className="mt-3 text-[11px] text-accent transition duration-[var(--motion-quick)] hover:underline"
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
              {t("sv.useSelection", { notes: t("diffModal.notes", { count: selectionRange.count }), start: formatTime(selectionRange.start), end: formatTime(selectionRange.end) })}
            </button>
          )}

          {!rangeValid && (
            <p className="mt-3 text-[11px] text-rose-300">
              {t("sv.rangeInvalid")}
            </p>
          )}
        </section>

        <section className={CARD}>
          <div className="flex items-center gap-1.5">
            <span className={LABEL}>
              {t(TABS.find((entry) => entry.value === tab)?.label ?? "sv.tabConstant")}
            </span>
            <InfoTip
              content={
                <>
                  <p className="m-0">{t("sv.previewInfo1")}</p>
                  <p className="mt-2">
                    {t("sv.previewInfo2")}
                  </p>
                </>
              }
            />
          </div>
          <p className="mt-1 text-[11px] leading-snug text-slate-500">
            {t(TAB_HELP[tab])}
          </p>

          <div className="mt-3 flex flex-col gap-3">
            {tab === "constant" && (
              <div className="grid gap-3 sm:grid-cols-2">
                {svField("SV ×", sv, setSv)}
              </div>
            )}

            {tab === "curve" && (
              <>
                <CurveEditor
                  keyframes={keyframes}
                  onChange={(kfs) => {
                    setKeyframes(kfs);
                    setApplied(false);
                  }}
                  selected={Math.min(selectedKf, keyframes.length - 1)}
                  onSelect={setSelectedKf}
                  disabled={!!readOnly}
                />

                <div className="grid grid-cols-[1fr,1fr,auto] items-end gap-3">
                  <Field label={t("sv.kfTime")}>
                    <NumberInput
                      min={rangeStart}
                      max={rangeEnd}
                      step={1}
                      disabled={isEdgeKf}
                      value={Math.round(rangeStart + selectedKfValue.x * rangeSpan)}
                      onChange={(e) => {
                        const ms = Number(e.target.value);
                        if (!Number.isFinite(ms) || rangeSpan <= 0) return;
                        patchSelectedKf({ x: (ms - rangeStart) / rangeSpan });
                      }}
                    />
                  </Field>
                  <Field label={t("sv.kfSv")}>
                    <PrecisionNumberInput
                      min={MIN_SV}
                      max={MAX_SV}
                      step={0.1}
                      value={selectedKfValue.sv}
                      onValueChange={(value) =>
                        patchSelectedKf({ sv: clampSv(value) })
                      }
                    />
                  </Field>
                  <Button
                    disabled={isEdgeKf || !!readOnly}
                    title={
                      isEdgeKf
                        ? t("sv.kfEdge")
                        : t("sv.kfRemove")
                    }
                    onClick={() => {
                      setKeyframes((kfs) =>
                        kfs.filter((_, i) => i !== safeSelectedKf),
                      );
                      setSelectedKf(Math.max(0, safeSelectedKf - 1));
                      setApplied(false);
                    }}
                  >
                    {t("common.remove")}
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={t("sv.shape")}
                    hint={t("sv.shapeHint")}
                  >
                    <Dropdown
                      aria-label={t("sv.shape")}
                      value={matchedPreset ?? ""}
                      options={[
                        ...(matchedPreset
                          ? []
                          : [{ value: "" as SvEasing | "", label: t("sv.customCurve") }]),
                        ...SV_EASINGS.map((id) => ({
                          value: id as SvEasing | "",
                          label: easingLabel(id, t),
                        })),
                      ]}
                      onChange={(preset) => {
                        if (!preset) return;
                        setKeyframes((kfs) =>
                          defaultSvCurve(
                            kfs[0].sv,
                            kfs[kfs.length - 1].sv,
                            EASING_HANDLES[preset],
                          ),
                        );
                        setSelectedKf(0);
                        setApplied(false);
                      }}
                    />
                  </Field>
                  <Field label={t("sv.spacing")}>
                    <div className="flex gap-1">
                      {DENSITIES.map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => {
                            setDensity(d);
                            setApplied(false);
                          }}
                          aria-pressed={density === d}
                          className={`flex-1 rounded-lg border px-2 py-2 text-xs font-medium transition duration-[var(--motion-quick)] active:scale-95 ${
                            density === d
                              ? "border-accent/60 bg-accent/15 text-accent"
                              : "border-white/10 bg-ink-700/60 text-slate-400 hover:bg-ink-600 hover:text-slate-200"
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
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  {svField(t("sv.peakSv"), peakSv, setPeakSv)}
                  <Field label={t("sv.peakLength")}>
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
                  <Field label={t("sv.cycle")}>
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
                </div>
                <p className="text-[11px] leading-snug text-slate-500">
                  {t("sv.cycleSummary", { peak: peakSv, percent: peakPercent, low: stutterLow.toFixed(2) })}
                  {stutterDrifts && (
                    <span className="text-amber-300">
                      {" "}
                      {t("sv.drift")}
                    </span>
                  )}
                </p>
              </>
            )}

            {tab === "normalize" && (
              <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs leading-snug text-slate-300">
                {t("sv.normalizeNote")}
              </p>
            )}

            {tab !== "remove" && (
              <label className="flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs text-slate-300">
                {t("sv.restore")}
                <Toggle
                  checked={restoreAtEnd}
                  onChange={(v) => {
                    setRestoreAtEnd(v);
                    setApplied(false);
                  }}
                  aria-label={t("sv.restore")}
                />
              </label>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-white/10 bg-ink-800/60 p-3">
          <canvas ref={canvasRef} className="block h-[120px] w-full" />
          <div className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 bg-slate-400/60" />
              {t("sv.current")}
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-0.5 w-4 bg-teal-400" />
              {t("sv.afterApply")}
            </span>
            <span className="ml-auto text-slate-600">
              {bpmScroll ? t("sv.scrollWithBpm") : t("sv.scrollSvOnly")}
            </span>
          </div>
        </section>
      </div>
    </Modal>
  );
}
