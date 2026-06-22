import type { LoadedSkin, PlaytestSettings } from "../types";
import { keyLabel } from "../lib/playtestKeybinds";
import type {
  HitResult,
  JudgementCounts,
  JudgementWindows,
  ManiaJudgement,
  PlaytestState,
} from "../lib/playtestJudgements";

const ORDER: ManiaJudgement[] = ["max", "300", "200", "100", "50", "miss"];

// Hit-error (unstable-rate) bar geometry, in px.
const ERROR_BAR_WIDTH = 280;
const ERROR_BAR_HEIGHT = 22;
const ERROR_TICK_HEIGHT = 15;
// How long (ms) a hit's tick lingers on the bar before it has fully faded out.
const ERROR_TICK_FADE_MS = 2400;
// Newest hits to consider when drawing ticks (older ones have faded anyway).
const ERROR_MAX_TICKS = 56;

/** Judgement → colour for the error-bar zones and ticks (osu!-style). */
function errorColor(judgement: ManiaJudgement): string {
  if (judgement === "max" || judgement === "300") return "#5bc0ff";
  if (judgement === "200" || judgement === "100") return "#6fcf5f";
  return "#e6a23c";
}

export function PlaytestOverlay({
  state,
  ended,
  paused,
  settings,
  windows,
  currentTimeMs,
  skin,
  keyCount,
  heldCodes,
  onContinue,
  onRetry,
  onReturn,
}: {
  state: PlaytestState;
  ended: boolean;
  paused: boolean;
  settings: PlaytestSettings;
  windows: JudgementWindows;
  currentTimeMs: number;
  skin: LoadedSkin | null;
  keyCount: number;
  heldCodes: Set<string>;
  onContinue: () => void;
  onRetry: () => void;
  onReturn: () => void;
}) {
  if (!state.active) return null;
  const latest = state.hitResults[state.hitResults.length - 1] ?? null;
  const keys = settings.keybinds[keyCount] ?? [];

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute left-1/2 top-8 flex -translate-x-1/2 flex-col items-center gap-2 text-center">
        {settings.showCombo && (
          <Combo value={state.combo} skin={skin} enabled={settings.useSkinComboFont} />
        )}
        {settings.showAccuracy && (
          <div className="rounded-full border border-white/10 bg-ink-900/42 px-3 py-1 text-sm font-semibold text-slate-100 shadow-lg backdrop-blur">
            {state.accuracy.toFixed(2)}%
          </div>
        )}
      </div>

      {settings.showJudgements && latest && (
        <div key={`${latest.noteId}:${latest.part}:${state.hitResults.length}`} className="playtest-judgement absolute left-1/2 top-[42%] -translate-x-1/2">
          <Judgement result={latest} skin={skin} enabled={settings.useSkinJudgements} />
        </div>
      )}

      {settings.showHitError && latest && latest.judgement !== "miss" && (
        <div key={`err:${state.hitResults.length}`} className="playtest-hit-error absolute left-1/2 top-[50%] -translate-x-1/2 rounded bg-ink-900/60 px-2 py-1 text-xs font-medium text-slate-200 backdrop-blur">
          {latest.hitError > 0 ? "+" : ""}
          {Math.round(latest.hitError)} ms
        </div>
      )}

      {settings.showErrorBar && (
        <div className="absolute bottom-[4.5rem] left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
          <div className="text-[10px] font-semibold tracking-wide text-slate-300/90 drop-shadow">
            {state.unstableRate.toFixed(1)} UR
          </div>
          <ErrorBar
            windows={windows}
            results={state.hitResults}
            currentTimeMs={currentTimeMs}
          />
        </div>
      )}

      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-1.5">
        {keys.map((code, i) => (
          <div
            key={`${code}:${i}`}
            className={`grid min-h-8 min-w-10 place-items-center rounded-lg border px-2 text-xs font-semibold shadow-lg backdrop-blur ${
              heldCodes.has(code)
                ? "border-accent/80 bg-accent/80 text-white"
                : "border-white/10 bg-ink-900/55 text-slate-300"
            }`}
          >
            {keyLabel(code)}
          </div>
        ))}
      </div>

      <div className="absolute right-4 top-4 grid grid-cols-2 gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-ink-900/55 p-3 text-xs text-slate-300 shadow-xl backdrop-blur">
        <Counts counts={state.judgements} />
      </div>

      {paused && !ended && (
        <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-ink-900/55 backdrop-blur-sm">
          <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-ink-800/92 p-5 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">Paused</h2>
            <p className="mt-1 text-xs text-slate-400">
              {state.accuracy.toFixed(2)}% · {state.maxCombo}x max combo
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                onClick={onContinue}
                className="rounded-lg border border-accent-deep/40 bg-accent/90 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-soft/95"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-lg border border-white/10 bg-ink-700/70 px-3 py-2 text-sm font-medium text-slate-100 transition hover:bg-ink-600"
              >
                Restart
              </button>
              <button
                type="button"
                onClick={onReturn}
                className="rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10"
              >
                Go to editor
              </button>
            </div>
            <p className="mt-4 text-[11px] text-slate-500">
              Esc to resume · {keyLabel(settings.quickRestartKey)} to restart · F5
              to leave
            </p>
          </div>
        </div>
      )}

      {ended && (
        <div className="pointer-events-auto absolute inset-0 grid place-items-center bg-ink-900/45 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-800/92 p-5 text-center shadow-2xl">
            <h2 className="text-lg font-semibold text-slate-100">Results</h2>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
              <ResultStat label="Accuracy" value={`${state.accuracy.toFixed(2)}%`} />
              <ResultStat label="Max combo" value={String(state.maxCombo)} />
              <ResultStat label="Score" value={state.score.toLocaleString()} />
              <ResultStat label="Judgements" value={String(state.hitResults.length)} />
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
                className="rounded-lg border border-accent-deep/40 bg-accent/90 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-accent-soft/95"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={onReturn}
                className="rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10"
              >
                Return to editor
              </button>
            </div>
          </div>
        </div>
      )}
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

/**
 * osu!-style hit-error / unstable-rate bar. Each recent hit is a vertical tick
 * placed by how early (left) or late (right) it was, coloured by judgement and
 * fading with age. Nested colour zones mark the OD judgement windows, a centre
 * line marks perfect timing, and a small arrow tracks the running average so a
 * consistent early/late bias is easy to spot.
 */
function ErrorBar({
  windows,
  results,
  currentTimeMs,
}: {
  windows: JudgementWindows;
  results: HitResult[];
  currentTimeMs: number;
}) {
  const half = ERROR_BAR_WIDTH / 2;
  const extent = Math.max(1, windows.hit50);
  const toX = (err: number) =>
    half + Math.max(-1, Math.min(1, err / extent)) * half;

  // Recent hits → fading ticks; their average drives the indicator arrow.
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
