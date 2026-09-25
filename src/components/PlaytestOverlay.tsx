import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { HudElementId, HudPlacement, LoadedSkin, PlaytestSettings } from "../types";
import { HUD_VISIBILITY, hudPlacement, withPlacement, type PlayfieldBounds } from "../lib/hudLayout";
import { HudEditorPanel, HudItem, PlayfieldHandles, type HudTarget } from "./HudEditor";
import { keyLabel } from "../lib/playtestKeybinds";
import type {
  HitResult,
  JudgementCounts,
  JudgementWindows,
  ManiaJudgement,
} from "../lib/playtestJudgements";
import { judgementCount } from "../lib/playtestScoring";
import type { PlaytestScoreStore } from "../lib/playtestScoreStore";
import type { HeldKeysStore } from "../hooks/usePlaytestInput";
import { useT } from "../lib/i18n";

const ORDER: ManiaJudgement[] = ["max", "300", "200", "100", "50", "miss"];

const ERROR_BAR_WIDTH = 280;
const ERROR_BAR_HEIGHT = 22;
const ERROR_TICK_HEIGHT = 15;
const ERROR_TICK_FADE_MS = 2400;
const ERROR_MAX_TICKS = 56;

/**
 * Where osu!mania puts things on its 768-high stage: judgements 180 above the
 * hit position (DefaultManiaJudgementPiece), combo 200 down from the top
 * (ManiaArgonSkinTransformer).
 */
const JUDGEMENT_ABOVE_HIT = 180 / 768;
const COMBO_FROM_TOP = 200 / 768;

function errorColor(judgement: ManiaJudgement): string {
  if (judgement === "max" || judgement === "300") return "#5bc0ff";
  if (judgement === "200" || judgement === "100") return "#6fcf5f";
  return "#e6a23c";
}

export function PlaytestOverlay({
  store,
  ended,
  paused,
  countdownEndsAt,
  settings,
  windows,
  getCurrentTime,
  hitLineFromEdge,
  upscroll,
  skin,
  keyCount,
  heldKeys,
  onContinue,
  onRetry,
  onReturn,
  onSettings,
  editing = false,
  previewScale = 1,
  onPatch,
  playfieldBoundsRef,
  npsGraph,
  runStats,
}: {
  store: PlaytestScoreStore;
  ended: boolean;
  paused: boolean;
  countdownEndsAt: number | null;
  settings: PlaytestSettings;
  windows: JudgementWindows;
  /** Gameplay time, for fading the error bar's ticks. */
  getCurrentTime: () => number;
  /** Pixels from the scroll edge of the playfield to the judgement line. */
  hitLineFromEdge: number;
  upscroll: boolean;
  skin: LoadedSkin | null;
  keyCount: number;
  heldKeys: HeldKeysStore;
  onContinue: () => void;
  onRetry: () => void;
  onReturn: () => void;
  onSettings?: () => void;
  editing?: boolean;
  previewScale?: number;
  onPatch: (patch: Partial<PlaytestSettings>) => void;
  playfieldBoundsRef: { current: PlayfieldBounds | null };
  npsGraph: ReactNode;
  runStats: ReactNode;
}) {
  const t = useT();
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const held = useSyncExternalStore(heldKeys.subscribe, heldKeys.getSnapshot);
  const [selected, setSelected] = useState<HudTarget | null>(null);
  if (!state.active) return null;
  const latest = state.hitResults[state.hitResults.length - 1] ?? (editing ? {
    noteId: "preview", column: 0, time: 0, hitError: 0, judgement: "max", part: "rice",
  } satisfies HitResult : null);
  const judged = state.judgedCount ?? judgementCount(state.judgements);
  const keys = settings.keybinds[keyCount] ?? [];
  const edge = upscroll ? "top" : "bottom";
  const item = (id: HudElementId) => ({
    id,
    placement: hudPlacement(settings.hud, id),
    visible: settings[HUD_VISIBILITY[id]] === true,
    editing,
    previewScale,
    selected: selected === id,
    onSelect: setSelected,
    onPlace: (target: HudElementId, placement: HudPlacement) =>
      onPatch({ hud: withPlacement(settings.hud, target, placement) }),
  });

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {editing && (
        <PlayfieldHandles
          previewScale={previewScale}
          boundsRef={playfieldBoundsRef}
          hitPosition={settings.hitPosition}
          upscroll={upscroll}
          selected={selected}
          onSelect={setSelected}
          onHitPosition={(hitPosition) => onPatch({ hitPosition })}
        />
      )}
      {(editing || state.combo > 0) && (
        <HudItem
          {...item("combo")}
          className="left-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ top: `${COMBO_FROM_TOP * 100}%` }}
        >
          <Combo value={state.combo} skin={skin} enabled={settings.useSkinComboFont} />
        </HudItem>
      )}

      {latest && (
        <HudItem
          {...item("judgement")}
          className="left-1/2 -translate-x-1/2"
          style={{
            [edge]: `calc(${hitLineFromEdge}px + ${JUDGEMENT_ABOVE_HIT * 100}%)`,
          }}
        >
          <div className="flex flex-col items-center gap-1">
            <div
              key={`${latest.noteId}:${latest.part}:${judged}`}
              className={editing ? "" : latest.judgement === "miss" ? "pt-judge-miss" : "pt-judge-hit"}
            >
              <Judgement result={latest} skin={skin} enabled={settings.useSkinJudgements} />
            </div>
            {settings.showHitError && latest.judgement !== "miss" && (
              <div
                key={`err:${judged}`}
                className={`${editing ? "" : "playtest-hit-error "}rounded bg-ink-900/60 px-2 py-0.5 text-xs font-medium tabular-nums text-slate-200 backdrop-blur`}
              >
                {latest.hitError > 0 ? "+" : ""}
                {Math.round(latest.hitError)} ms
              </div>
            )}
          </div>
        </HudItem>
      )}

      <HudItem {...item("accuracy")} className="right-4 top-4">
        <div className="flex flex-col items-end gap-2">
          <div className="text-3xl font-bold tabular-nums leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
            {state.accuracy.toFixed(2)}%
          </div>
          {(settings.rate ?? 1) !== 1 && (
            <div className="rounded-full border border-accent/40 bg-accent/20 px-2.5 py-0.5 text-xs font-semibold text-accent-soft shadow-lg backdrop-blur">
              {t("playtest.rate", { rate: settings.rate ?? 1 })}
            </div>
          )}
        </div>
      </HudItem>
      <HudItem
        {...item("counts")}
        className="right-4"
        style={{ top: (settings.rate ?? 1) !== 1 ? "5.25rem" : "3.375rem" }}
      >
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 rounded-xl border border-white/10 bg-ink-900/55 px-3 py-2 text-[11px] text-slate-300 shadow-xl backdrop-blur">
          <Counts counts={state.judgements} />
        </div>
      </HudItem>

      <HudItem {...item("errorBar")} className="bottom-3 left-1/2 -translate-x-1/2">
        <div className="flex flex-col items-center gap-1">
          <div className="text-[10px] font-semibold tracking-wide text-slate-300/90 drop-shadow">
            {state.unstableRate.toFixed(1)} UR
          </div>
          <ErrorBar
            windows={windows}
            results={state.hitResults}
            getCurrentTime={getCurrentTime}
          />
        </div>
      </HudItem>

      <HudItem {...item("keys")} className="bottom-4 right-4">
        <div className="flex gap-1">
          {keys.map((code, i) => (
            <div
              key={`${code}:${i}`}
              className={`grid min-h-7 min-w-8 place-items-center rounded-md border px-1.5 text-[11px] font-semibold shadow-lg backdrop-blur transition-colors duration-75 ${
                held.has(code)
                  ? "border-accent/80 bg-accent/80 text-white"
                  : "border-white/10 bg-ink-900/55 text-slate-400"
              }`}
            >
              {keyLabel(code)}
            </div>
          ))}
        </div>
      </HudItem>

      <HudItem {...item("npsGraph")} className="bottom-28 left-3 top-52" fill>
        {npsGraph}
      </HudItem>
      <HudItem {...item("runStats")} className="left-3 top-3">
        {runStats}
      </HudItem>

      {!editing && paused && !ended && (
        <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-ink-900/55 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-ink-800/92 p-5 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">{t("playtest.paused")}</h2>
            <p className="mt-1 text-xs text-slate-400">
              {t("playtest.pausedSummary", { accuracy: state.accuracy.toFixed(2), combo: state.maxCombo })}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={onContinue}
                className="rounded-lg border border-accent-deep/40 bg-accent/90 px-3 py-2 text-sm font-medium text-white shadow-sm transition duration-150 hover:bg-accent-soft/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 active:scale-[0.98]"
              >
                {t("playtest.continue")}
              </button>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg border border-white/10 bg-ink-700/70 px-3 py-2 text-sm font-medium text-slate-100 transition duration-150 hover:bg-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
              >
                {t("playtest.restart")}
              </button>
              {onSettings && (
                <button
                  type="button"
                  onClick={onSettings}
                  className="rounded-lg border border-white/10 bg-ink-700/70 px-3 py-2 text-sm font-medium text-slate-100 transition duration-150 hover:bg-ink-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
                >
                  {t("playtest.settings")}
                </button>
              )}
              <button
                type="button"
                onClick={onReturn}
                className="rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-300 transition duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
              >
                {t("playtest.goToEditor")}
              </button>
            </div>
            <p className="mt-4 text-[11px] text-slate-500">
              {t("playtest.pauseKeys", { key: keyLabel(settings.quickRestartKey) })}
            </p>
          </div>
        </div>
      )}

      {!editing && ended && (
        <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-ink-900/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-800/92 p-5 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">
              {t("playtest.results")}
              {(settings.rate ?? 1) !== 1 && (
                <span className="ml-2 align-middle text-xs font-semibold text-accent-soft">
                  {t("playtest.rate", { rate: settings.rate ?? 1 })}
                </span>
              )}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <ResultStat label={t("playtest.accuracy")} value={`${state.accuracy.toFixed(2)}%`} />
              <ResultStat label={t("playtest.maxCombo")} value={String(state.maxCombo)} />
              <ResultStat label={t("playtest.score")} value={state.score.toLocaleString()} />
              <ResultStat label={t("playtest.judgements")} value={String(judged)} />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-1.5 text-xs">
              {ORDER.map((j) => (
                <ResultStat key={j} label={labelOf(j)} value={String(state.judgements[j])} />
              ))}
            </div>
            <div className="mt-5 flex justify-center gap-2">
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg border border-accent-deep/40 bg-accent/90 px-3 py-2 text-sm font-medium text-white shadow-sm transition duration-150 hover:bg-accent-soft/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 active:scale-[0.98]"
              >
                {t("common.retry")}
              </button>
              <button
                type="button"
                onClick={onReturn}
                className="rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-300 transition duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:scale-[0.98]"
              >
                {t("playtest.returnToEditor")}
              </button>
            </div>
          </div>
        </div>
      )}

      {!editing && countdownEndsAt !== null && (
        <PlaytestCountdown endsAt={countdownEndsAt} resuming />
      )}
      {editing && (
        <HudEditorPanel settings={settings} selected={selected} onSelect={setSelected} onPatch={onPatch} onDone={onReturn} />
      )}
    </div>
  );
}

function PlaytestCountdown({
  endsAt,
  resuming = false,
}: {
  endsAt: number;
  resuming?: boolean;
}) {
  const t = useT();
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, endsAt - performance.now()),
  );

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const next = Math.max(0, endsAt - performance.now());
      setRemaining(next);
      if (next > 0) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [endsAt]);

  const seconds = Math.max(1, Math.ceil(remaining / 1000));
  const progress = Math.max(0, Math.min(1, 1 - remaining / 2000));

  return (
    <div className="pointer-events-none absolute inset-0 z-40 grid place-items-center bg-ink-900/28 backdrop-blur-[2px]">
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-white/10 bg-ink-900/76 px-10 py-7 text-center shadow-2xl backdrop-blur-xl">
        <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-300">
          {resuming ? t("playtest.resuming") : t("playtest.getReady")}
        </span>
        <div
          className="grid h-24 w-24 place-items-center rounded-full p-1 shadow-[0_0_32px_rgba(91,192,255,0.2)]"
          style={{
            background: `conic-gradient(rgb(91 192 255) ${progress * 360}deg, rgb(255 255 255 / 0.09) 0deg)`,
          }}
        >
          <div className="grid h-full w-full place-items-center rounded-full bg-ink-900 text-5xl font-black tabular-nums text-white">
            {seconds}
          </div>
        </div>
      </div>
    </div>
  );
}

function Combo({
  value,
  skin,
  enabled,
}: {
  value: number;
  skin: LoadedSkin | null;
  enabled: boolean;
}) {
  const digits = String(Math.max(0, value)).split("");
  const assets = skin?.ui.comboNumbers;
  const canUseSkin = enabled && digits.every((d) => assets?.[d]);
  if (canUseSkin) {
    return (
      <div className="flex items-center justify-center gap-0.5">
        {digits.map((d, i) => (
          <img key={`${d}:${i}`} src={assets?.[d]} alt={d} className="h-12 w-auto" />
        ))}
      </div>
    );
  }
  return (
    <div className="text-5xl font-black leading-none text-white drop-shadow-[0_3px_12px_rgba(0,0,0,0.65)]">
      {value}
    </div>
  );
}

function Judgement({
  result,
  skin,
  enabled,
}: {
  result: HitResult;
  skin: LoadedSkin | null;
  enabled: boolean;
}) {
  const src = enabled ? skin?.ui.judgementImages[result.judgement] : null;
  if (src) {
    return <img src={src} alt={labelOf(result.judgement)} className="h-16 w-auto" />;
  }
  return (
    <div className={`text-4xl font-black tracking-wide ${result.judgement === "miss" ? "text-rose-300" : "text-white"}`}>
      {labelOf(result.judgement)}
    </div>
  );
}

function Counts({ counts }: { counts: JudgementCounts }) {
  return (
    <>
      {ORDER.map((j) => (
        <div key={j} className="contents">
          <span>{labelOf(j)}</span>
          <span className="text-right font-mono text-slate-100">{counts[j]}</span>
        </div>
      ))}
    </>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-ink-700/70 px-2 py-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-0.5 font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function ErrorBar({
  windows,
  results,
  getCurrentTime,
}: {
  windows: JudgementWindows;
  results: HitResult[];
  getCurrentTime: () => number;
}) {
  // Ticks fade on their own clock; the HUD otherwise only redraws per hit.
  const [currentTimeMs, setCurrentTimeMs] = useState(getCurrentTime);
  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTimeMs(getCurrentTime()), 100);
    return () => window.clearInterval(timer);
  }, [getCurrentTime]);
  const half = ERROR_BAR_WIDTH / 2;
  const extent = Math.max(1, windows.hit50);
  const toX = (err: number) =>
    half + Math.max(-1, Math.min(1, err / extent)) * half;

  const ticks: { x: number; color: string; opacity: number }[] = [];
  let sum = 0;
  for (const r of results.slice(-ERROR_MAX_TICKS)) {
    if (r.judgement === "miss") continue;
    const opacity = 1 - (currentTimeMs - r.time) / ERROR_TICK_FADE_MS;
    if (opacity <= 0.04) continue;
    ticks.push({ x: toX(r.hitError), color: errorColor(r.judgement), opacity });
    sum += r.hitError;
  }
  const avgX = ticks.length ? toX(sum / ticks.length) : null;

  const zone = (ms: number, color: string) => (
    <div
      className="absolute top-1/2 -translate-y-1/2 rounded-full"
      style={{
        left: toX(-ms),
        width: (Math.min(ms, extent) / extent) * ERROR_BAR_WIDTH,
        height: 5,
        background: color,
        opacity: 0.85,
      }}
    />
  );

  return (
    <div
      className="relative rounded bg-ink-900/55 shadow-lg backdrop-blur"
      style={{ width: ERROR_BAR_WIDTH, height: ERROR_BAR_HEIGHT }}
    >
      {zone(extent, errorColor("50"))}
      {zone(windows.hit100, errorColor("100"))}
      {zone(windows.hit300, errorColor("300"))}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/85"
        style={{ width: 2, height: ERROR_BAR_HEIGHT }}
      />
      {ticks.map((t, i) => (
        <div
          key={i}
          className="absolute top-1/2 -translate-y-1/2"
          style={{
            left: t.x - 1,
            width: 2,
            height: ERROR_TICK_HEIGHT,
            background: t.color,
            opacity: t.opacity,
          }}
        />
      ))}
      {avgX != null && (
        <div
          className="absolute -translate-x-1/2"
          style={{
            left: avgX,
            top: -5,
            width: 0,
            height: 0,
            borderLeft: "4px solid transparent",
            borderRight: "4px solid transparent",
            borderTop: "6px solid rgba(255,255,255,0.95)",
          }}
        />
      )}
    </div>
  );
}

function labelOf(judgement: ManiaJudgement): string {
  return judgement === "max" ? "MAX" : judgement === "miss" ? "MISS" : judgement;
}
