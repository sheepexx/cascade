import { useEffect, useMemo, useState } from "react";
import type { ManiaNote } from "../types";
import { computeNpsSeries, rollingNpsAt } from "../lib/nps";
import type { AutoplayPlanSummary } from "../lib/autoplay";
import { STRAIN_THRESHOLD, type SkillProfile } from "../lib/playerSkill";
import type { PlaytestState } from "../lib/playtestJudgements";
import { useT } from "../lib/i18n";

const LIVE_REFRESH_MS = 120;

export function PlaytestRunStats({
  state,
  notes,
  durationMs,
  getCurrentTime,
  autoplay,
  autoplaySummary,
  humanized,
  showNps,
  skillProfile,
  skillEnabled,
}: {
  state: PlaytestState;
  notes: ManiaNote[];
  durationMs: number;
  getCurrentTime: () => number;
  autoplay: boolean;
  autoplaySummary: AutoplayPlanSummary | null;
  humanized: boolean;
  showNps: boolean;
  skillProfile: SkillProfile | null;
  skillEnabled: boolean;
}) {
  const t = useT();
  const [liveNps, setLiveNps] = useState(0);

  const series = useMemo(
    () => computeNpsSeries(notes, 500, durationMs),
    [notes, durationMs],
  );

  useEffect(() => {
    const id = window.setInterval(() => {
      setLiveNps(rollingNpsAt(series, getCurrentTime(), 2000));
    }, LIVE_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [series, getCurrentTime]);

  const judged = state.hitResults.length;
  const meanError = useMemo(() => {
    const scored = state.hitResults.filter((r) => r.judgement !== "miss");
    if (scored.length === 0) return 0;
    return scored.reduce((sum, r) => sum + r.hitError, 0) / scored.length;
  }, [state.hitResults]);

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-30 w-[13.5rem] rounded-xl border border-white/10 bg-ink-900/55 p-2.5 text-[11px] shadow-xl shadow-black/25 backdrop-blur-xl">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
          {t("runStats.title")}
        </span>
        {autoplay && (
          <span className="rounded bg-accent/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-soft">
            {humanized ? t("runStats.autoHuman") : t("runStats.auto")}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {showNps && (
          <>
            <Row label={t("runStats.nps")} value={liveNps.toFixed(1)} />
            <Row label={t("runStats.peakNps")} value={series.peak.toFixed(1)} />
          </>
        )}
        <Row
          label={t("runStats.combo")}
          value={`${state.combo}/${state.maxCombo}`}
        />
        <Row label={t("runStats.accuracy")} value={`${state.accuracy.toFixed(2)}%`} />
        <Row label={t("runStats.ur")} value={state.unstableRate.toFixed(1)} />
        <Row
          label={t("runStats.meanError")}
          value={`${meanError >= 0 ? "+" : ""}${meanError.toFixed(1)}ms`}
        />
        <Row label={t("runStats.judged")} value={`${judged}/${notes.length}`} />
        <Row label={t("runStats.misses")} value={String(state.judgements.miss)} />
      </div>

      {autoplay && skillEnabled && skillProfile && skillProfile.loads.size > 0 && (
        <div className="mt-1.5 border-t border-white/10 pt-1.5">
          <div className="flex items-baseline justify-between gap-1">
            <span className="text-slate-500">{t("runStats.strain")}</span>
            <span
              className={`font-semibold tabular-nums ${
                skillProfile.peakLoad >= 1
                  ? "text-rose-300"
                  : skillProfile.peakLoad >= STRAIN_THRESHOLD
                    ? "text-amber-300"
                    : "text-emerald-300"
              }`}
            >
              {t("runStats.strainValue", {
                percent: Math.round(
                  (skillProfile.strained / skillProfile.loads.size) * 100,
                ),
                peak: skillProfile.peakLoad.toFixed(1),
              })}
            </span>
          </div>
        </div>
      )}

      {autoplay && autoplaySummary && autoplaySummary.unplayable > 0 && (
        <div className="mt-1.5 border-t border-white/10 pt-1.5 text-[10px] text-amber-300">
          {t("runStats.unplayable", { count: autoplaySummary.unplayable })}
          <span className="ml-1 text-slate-500">
            {t("runStats.unplayableBreakdown", {
              stacked: autoplaySummary.stacked,
              inLn: autoplaySummary.insideLn,
            })}
          </span>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-1">
      <span className="truncate text-slate-500">{label}</span>
      <span className="font-semibold tabular-nums text-slate-100">{value}</span>
    </div>
  );
}
