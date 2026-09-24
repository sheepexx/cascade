import { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, ErrorIcon, WarningIcon } from "../ui/Icons";
import {
  AIMOD_CATEGORIES,
  formatAiModObjects,
  formatAiModTime,
  type AiModCategory,
  type AiModIssue,
  type AiModReport,
} from "../../lib/aimod";
import { patternCorpus } from "../../lib/patternCorpus";
import { InfoTip } from "../ui/Tooltip";
import { Modal } from "../ui/Modal";
import { Button, Toggle } from "../ui/Controls";
import { useT, type MessageKey } from "../../lib/i18n";

type Tab = "All" | AiModCategory;
const TABS: Tab[] = ["All", ...AIMOD_CATEGORIES];
const PREVIEW_DETAILS = 5;

const TAB_LABELS: Record<Tab, MessageKey> = {
  All: "aimodUi.tabAll",
  Criteria: "aimodUi.tabCriteria",
  Guidelines: "aimodUi.tabGuidelines",
  Patterns: "aimodUi.tabPatterns",
  Compose: "aimodUi.tabCompose",
  Design: "aimodUi.tabDesign",
  Timing: "aimodUi.tabTiming",
  Meta: "aimodUi.tabMeta",
  Mapset: "aimodUi.tabMapset",
};

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
  const t = useT();
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
            <Button
              variant="primary"
              onClick={onResnap}
              title={t("aimodUi.resnapHint")}
            >
              {t("aimodUi.resnap", { count: unsnappedCount })}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="accent" onClick={onRefresh}>
              {t("aimodUi.refresh")}
            </Button>
            <span className="mx-1 h-5 w-px bg-white/10" />
            <Toggle
              id="aimod-all-difficulties"
              size="sm"
              checked={allDifficulties}
              onChange={setAllDifficulties}
              aria-label={t("aimodUi.allDiffsLabel")}
            />
            <label htmlFor="aimod-all-difficulties" className="cursor-pointer text-xs text-slate-400">
              {t("aimodUi.allDiffs")}
            </label>
          </div>
          <div className="flex gap-6 rounded-xl border border-white/10 bg-ink-700/40 px-4 py-2 text-sm">
            <Summary
              label={t("aimodUi.scope")}
              value={allDifficulties ? t("bgScope.mapset") : activeDiffName}
            />
            <Summary
              label={t("aimodUi.warnings")}
              value={String(report ? counts.warnings : 0)}
              tone="warning"
            />
            <Summary
              label={t("aimodUi.errors")}
              value={String(report ? counts.errors : 0)}
              tone="error"
            />
          </div>
        </div>

        {report && <section className="rounded-xl border border-teal-300/20 bg-teal-300/5 p-4">
          <div className="flex items-start justify-between gap-4"><div><h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-100">{t("aimodUi.readiness")} <InfoTip content={<>
            <p className="m-0">{t("aimodUi.info1")}</p>
            <p className="mt-2">{t("aimodUi.info2")}</p>
            <p className="mt-2">{t("aimodUi.info3", { difficulties: patternCorpus.source.difficulties, mapsets: patternCorpus.source.mapsets, from: patternCorpus.source.rankedFrom, to: patternCorpus.source.rankedTo })}</p>
            <p className="mt-2">{t("aimodUi.info4")}</p>
          </>} /></h3>
            <p className={`mt-1 text-xs ${report.errors ? "text-amber-200" : "text-teal-200"}`}>{report.errors ? t("aimodUi.structural", { count: report.errors }) : t("aimodUi.noBlockers")}</p></div>
            <div className="text-right"><strong className="text-xl text-teal-100">{report.quality.score ?? "—"}{report.quality.score !== null && <span className="text-xs text-slate-500"> / 100</span>}</strong><p className="text-[10px] text-slate-400">{t("aimodUi.score")}</p></div>
          </div>
          <ul className="mt-3 flex flex-col gap-2">{report.quality.difficulties.map(d => <li key={d.id} className="rounded-lg bg-black/15 p-2 text-xs">
            <div className="flex justify-between gap-3"><span className="text-slate-200">{d.name} <span className="whitespace-nowrap text-[10px] text-slate-500">{t("aimodUi.judgedAs", { tier: d.tier })}</span></span><span className="text-teal-200">{d.score === null ? t("aimodUi.tooFew") : `${d.score}/100`}</span></div>
            <p className="mt-1 text-[10px] text-slate-500">
              {d.comparison.bucket === null ? t("aimodUi.noComparable") : d.comparison.outliers.length ? t("aimodUi.aboveRange", { list: d.comparison.outliers.map(o => o.label).join(", ") }) : t("aimodUi.withinRange")}
            </p>
          </li>)}</ul>
        </section>}
        <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
          {TABS.map((entry) => {
            const count = entry === "All" ? scoped.length : byCategory.get(entry) ?? 0;
            const activeTab = entry === tab;
            return (
              <button
                key={entry}
                onClick={() => setTab(entry)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTab
                    ? "bg-accent/90 text-white"
                    : "text-slate-400 hover:bg-white/10 hover:text-slate-200"
                }`}
              >
                {t(TAB_LABELS[entry])} ({count})
              </button>
            );
          })}
        </div>

        {shown.length === 0 ? (
          <p className="py-6 text-center text-sm text-emerald-300">
            {report && report.issues.length === 0
              ? t("aimodUi.noIssues")
              : !allDifficulties && scoped.length === 0
                ? t("aimodUi.nothingHere")
                : t("aimodUi.noIssuesCategory")}
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
                      {issue.severity === "error" ? (
                        <ErrorIcon className="h-4 w-4" />
                      ) : (
                        <WarningIcon className="h-4 w-4" />
                      )}
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
                        title={t("aimodUi.jump")}
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
                            title={d.endTime === undefined ? t("aimodUi.jump") : t("aimodUi.jumpPassage")}
                          >
                            {formatAiModTime(d.time)}
                            {d.endTime !== undefined && ` → ${formatAiModTime(d.endTime)}`}{" "}
                            {formatAiModObjects(d.objects)}
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
                            {t("aimodUi.showMore", { count: hidden })}
                          </button>
                        </li>
                      )}
                      {hidden === 0 && untracked > 0 && (
                        <li className="py-1 text-xs text-slate-500">
                          {t("aimodUi.notListed", { count: untracked })}
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
