import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon } from "../ui/Icons";
import {
  AIMOD_CATEGORIES,
  formatAiModObjects,
  formatAiModTime,
  type AiModCategory,
  type AiModIssue,
  type AiModReport,
} from "../../lib/aimod";
import { describeCorpusBucket, patternCorpus } from "../../lib/patternCorpus";
import { InfoTip } from "../ui/Tooltip";
import { Modal } from "../ui/Modal";
import { Button, Toggle } from "../ui/Controls";

type Tab = "All" | AiModCategory;
const TABS: Tab[] = ["All", ...AIMOD_CATEGORIES];
const PREVIEW_DETAILS = 5;

type Props = {
  open: boolean;
  onClose: () => void;
  report: AiModReport | null;
  activeDiffId: string;
  activeDiffName: string;
  onRefresh: () => void;
  onJump: (issue: AiModIssue, time?: number) => void;
  unsnappedCount: number;
  onResnap: () => void;
};

export function AiModModal({
  open,
  onClose,
  report,
  activeDiffId,
  activeDiffName,
  onRefresh,
  onJump,
  unsnappedCount,
  onResnap,
}: Props) {
  const [tab, setTab] = useState<Tab>("All");
  const [allDifficulties, setAllDifficulties] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, number>>({});

  useEffect(() => {
    setExpanded({});
  }, [report]);

  const scoped = useMemo(() => {
    if (!report) return [];
    if (allDifficulties) return report.issues;
    return report.issues.filter(
      (i) => i.diffId === undefined || i.diffId === activeDiffId,
    );
  }, [report, allDifficulties, activeDiffId]);

  const counts = useMemo(() => {
    let warnings = 0;
    let errors = 0;
    for (const i of scoped) {
      if (i.severity === "error") errors += 1;
      else warnings += 1;
    }
    return { warnings, errors };
  }, [scoped]);

  const byCategory = useMemo(() => {
    const map = new Map<AiModCategory, number>();
    for (const c of AIMOD_CATEGORIES) map.set(c, 0);
    for (const i of scoped) map.set(i.category, (map.get(i.category) ?? 0) + 1);
    return map;
  }, [scoped]);

  const shown = useMemo(() => {
    const list =
      tab === "All" ? scoped : scoped.filter((i) => i.category === tab);
    // Errors first, then warnings; keep stable order within a severity.
    return [...list].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      return 0;
    });
  }, [scoped, tab]);

  const ownPrefix = `[${activeDiffName}] `;
  const label = (issue: AiModIssue) =>
    !allDifficulties && issue.message.startsWith(ownPrefix)
      ? issue.message.slice(ownPrefix.length)
      : issue.message;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="AiMod"
      width="max-w-2xl"
      footer={
        <>
          {unsnappedCount > 0 && (
            <Button variant="primary" onClick={onResnap}>
              Resnap {unsnappedCount} object{unsnappedCount === 1 ? "" : "s"}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="accent" onClick={onRefresh}>
              Refresh
            </Button>
            <InfoTip content={<>
              <p className="m-0">Checks metadata, timing, object structure and pattern strain across the loaded mapset.</p>
              <p className="mt-2">Unsnapped objects are the usual reason a perfectly timed converted map shows as off-grid in osu!. Resnap moves them onto the nearest valid beat divisor.</p>
            </>} />
            <span className="mx-1 h-5 w-px bg-white/10" />
            <Toggle
              id="aimod-all-difficulties"
              size="sm"
              checked={allDifficulties}
              onChange={setAllDifficulties}
              aria-label="Show issues from all difficulties"
            />
            <label htmlFor="aimod-all-difficulties" className="cursor-pointer text-xs text-slate-400">
              All difficulties
            </label>
            <InfoTip content={<>
              <p className="m-0">Off, the list covers the difficulty you are editing plus checks that apply to the whole mapset, such as metadata and shared audio.</p>
              <p className="mt-2">On, it adds every issue found in the other difficulties. Each of those is prefixed with the difficulty name.</p>
            </>} />
          </div>
          <div className="flex gap-6 rounded-xl border border-white/10 bg-ink-700/40 px-4 py-2 text-sm">
            <Summary
              label="Scope"
              value={allDifficulties ? "Whole mapset" : activeDiffName}
            />
            <Summary
              label="Warnings"
              value={String(report ? counts.warnings : 0)}
              tone="warning"
            />
            <Summary
              label="Errors"
              value={String(report ? counts.errors : 0)}
              tone="error"
            />
          </div>
        </div>

        {report && <section className="rounded-xl border border-teal-300/20 bg-teal-300/5 p-4">
          <div className="flex items-start justify-between gap-4"><div><h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">Ranking readiness <InfoTip content={<>
            <p className="m-0">Heuristic guidance, not a probability of being ranked. The set score uses its lowest difficulty score.</p>
            <p className="mt-2">Patterns are compared against {patternCorpus.source.difficulties} difficulties from {patternCorpus.source.mapsets} mapsets ranked between {patternCorpus.source.rankedFrom} and {patternCorpus.source.rankedTo}, so "unusual" means rare among them, not wrong.</p>
            <p className="mt-2">Jacks, anchors and asymmetry can be intentional. Musical interpretation, difficulty spread and full ranking criteria still need human review.</p>
          </>} /></h3>
            <p className={`mt-1 text-xs ${report.errors ? "text-amber-200" : "text-teal-200"}`}>{report.errors ? `${report.errors} structural issue${report.errors === 1 ? "" : "s"} across the mapset to fix before review` : "No automatic structural blockers found"}</p></div>
            <div className="text-right"><strong className="text-xl text-teal-100">{report.quality.score ?? "—"}{report.quality.score !== null && <span className="text-xs text-slate-500"> / 100</span>}</strong><p className="text-[10px] text-slate-400">Pattern review score</p></div>
          </div>
          <ul className="mt-3 flex flex-col gap-2">{report.quality.difficulties.map(d => <li key={d.id} className="rounded-lg bg-black/15 p-2 text-xs">
            <div className="flex justify-between gap-3"><span className="text-slate-200">{d.name} <span className="whitespace-nowrap text-[10px] text-slate-500">judged as {d.tier} <InfoTip content={<>
              <p className="m-0">Estimated from this difficulty's star rating, not from its name, and it decides which ranking criteria guidelines apply.</p>
              <p className="mt-2">It agrees with how mappers name difficulties about 4 times in 5, so check this first if a guideline looks wrong for the level.</p>
            </>} /></span></span><span className="text-teal-200">{d.score === null ? "Too few notes to score" : `${d.score}/100`}</span></div>
            <p className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
              {d.comparison.bucket === null ? "No comparable ranked maps" : d.comparison.outliers.length ? `Above the usual range: ${d.comparison.outliers.map(o => o.label).join(", ")}` : "Within the usual range"}
              <InfoTip content={d.comparison.bucket === null
                ? <p className="m-0">The reference set has no ranked maps at this key count and density, so no pattern comparison was made.</p>
                : <>
                  <p className="m-0">Compared with {describeCorpusBucket(d.comparison.bucket)}.</p>
                  {d.comparison.outliers.length > 0 && <p className="mt-2">These sit above the 90th percentile of those maps. Review the musical intent before changing anything.</p>}
                </>} />
            </p>
          </li>)}</ul>
        </section>}
        <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
          {TABS.map((t) => {
            const count = t === "All" ? scoped.length : byCategory.get(t) ?? 0;
            const activeTab = t === tab;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTab
                    ? "bg-accent/90 text-white"
                    : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                }`}
              >
                {t} ({count})
              </button>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-emerald-300">
            {report && report.issues.length === 0
              ? "Everything looks good - no issues found."
              : !allDifficulties && scoped.length === 0
                ? "Nothing to fix in this difficulty. Turn on All difficulties to see the rest of the mapset."
                : "No issues in this category."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            {shown.map((issue) => {
              const details = issue.details ?? [];
              const visible = expanded[issue.id] ?? 0;
              const isOpen = visible > 0;
              const listed = details.slice(0, visible);
              const hidden = details.length - listed.length;
              const untracked = (issue.count ?? details.length) - details.length;
              return (
                <li key={issue.id} className="bg-ink-700/30">
                  <div className="flex items-start gap-3 px-3 py-2 text-sm">
                    <span
                      className={`mt-0.5 shrink-0 ${
                        issue.severity === "error"
                          ? "text-red-400"
                          : "text-amber-300"
                      }`}
                      aria-hidden
                    >
                      {issue.severity === "error" ? "⛔" : "⚠"}
                    </span>
                    {details.length > 0 ? (
                      <button
                        onClick={() =>
                          setExpanded((prev) => ({
                            ...prev,
                            [issue.id]: isOpen ? 0 : PREVIEW_DETAILS,
                          }))
                        }
                        className="flex flex-1 items-start gap-2 text-left"
                        aria-expanded={isOpen}
                      >
                        <ChevronDownIcon
                          className={`mt-0.5 h-3 w-3 shrink-0 text-slate-400 transition-transform duration-200 ${
                            isOpen ? "" : "-rotate-90"
                          }`}
                        />
                        <span className="flex-1 text-slate-200 transition duration-150 hover:text-white">
                          {label(issue)}
                        </span>
                        <span className="shrink-0 rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-slate-300">
                          {issue.count ?? details.length}
                        </span>
                      </button>
                    ) : (
                      <span className="flex-1 text-slate-200">{label(issue)}</span>
                    )}
                    {issue.time !== undefined && (
                      <button
                        onClick={() => onJump(issue)}
                        className="shrink-0 font-mono text-xs text-accent hover:underline"
                        title="Jump to this time"
                      >
                        {formatAiModTime(issue.time)}
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <ul className="flex flex-col border-t border-white/5 bg-ink-800/50 px-3 py-1.5 pl-9">
                      {listed.map((d, i) => (
                        <li
                          key={`${issue.id}_${i}`}
                          className="flex flex-wrap items-baseline gap-x-2 py-0.5 text-xs"
                        >
                          <button
                            onClick={() => onJump(issue, d.time)}
                            className="font-mono text-accent hover:underline"
                            title="Jump to this time"
                          >
                            {formatAiModTime(d.time)} {formatAiModObjects(d.objects)}
                          </button>
                          <span className="text-slate-400">- {d.label}</span>
                        </li>
                      ))}
                      {hidden > 0 && (
                        <li className="py-1">
                          <button
                            onClick={() =>
                              setExpanded((prev) => ({
                                ...prev,
                                [issue.id]: details.length,
                              }))
                            }
                            className="text-xs font-medium text-accent hover:underline"
                          >
                            Show {hidden} more
                          </button>
                        </li>
                      )}
                      {hidden === 0 && untracked > 0 && (
                        <li className="py-1 text-xs text-slate-500">
                          {untracked} more not listed.
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

      </div>
    </Modal>
  );
}

function Summary({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning" | "error";
}) {
  const color =
    tone === "error"
      ? "text-red-300"
      : tone === "warning"
        ? "text-amber-300"
        : "text-slate-200";
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <span className={`font-medium ${color}`}>{value}</span>
    </div>
  );
}
