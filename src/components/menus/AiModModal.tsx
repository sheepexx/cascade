import { useMemo, useState } from "react";
import {
  AIMOD_CATEGORIES,
  type AiModCategory,
  type AiModIssue,
  type AiModReport,
} from "../../lib/aimod";
import { formatTime } from "../../lib/timing";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";

type Tab = "All" | AiModCategory;
const TABS: Tab[] = ["All", ...AIMOD_CATEGORIES];

type Props = {
  open: boolean;
  onClose: () => void;
  report: AiModReport | null;
  activeDiffName: string;
  onRefresh: () => void;
  onJump: (issue: AiModIssue) => void;
  unsnappedCount: number;
  onResnap: () => void;
};

export function AiModModal({
  open,
  onClose,
  report,
  activeDiffName,
  onRefresh,
  onJump,
  unsnappedCount,
  onResnap,
}: Props) {
  const [tab, setTab] = useState<Tab>("All");

  const byCategory = useMemo(() => {
    const map = new Map<AiModCategory, number>();
    for (const c of AIMOD_CATEGORIES) map.set(c, 0);
    if (report)
      for (const i of report.issues)
        map.set(i.category, (map.get(i.category) ?? 0) + 1);
    return map;
  }, [report]);

  const shown = useMemo(() => {
    if (!report) return [];
    const list =
      tab === "All"
        ? report.issues
        : report.issues.filter((i) => i.category === tab);
    // Errors first, then warnings; keep stable order within a severity.
    return [...list].sort((a, b) => {
      if (a.severity !== b.severity) return a.severity === "error" ? -1 : 1;
      return 0;
    });
  }, [report, tab]);

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
          <Button variant="accent" onClick={onRefresh}>
            Refresh
          </Button>
          <div className="flex gap-6 rounded-xl border border-white/10 bg-ink-700/40 px-4 py-2 text-sm">
            <Summary label="Difficulty" value={activeDiffName} />
            <Summary
              label="Warnings"
              value={String(report?.warnings ?? 0)}
              tone="warning"
            />
            <Summary
              label="Errors"
              value={String(report?.errors ?? 0)}
              tone="error"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1 border-b border-white/10 pb-2">
          {TABS.map((t) => {
            const count =
              t === "All" ? report?.issues.length ?? 0 : byCategory.get(t) ?? 0;
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
              : "No issues in this category."}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            {shown.map((issue) => (
              <li
                key={issue.id}
                className="flex items-start gap-3 bg-ink-700/30 px-3 py-2 text-sm"
              >
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
                <span className="flex-1 text-slate-200">{issue.message}</span>
                {issue.time !== undefined && (
                  <button
                    onClick={() => onJump(issue)}
                    className="shrink-0 font-mono text-xs text-accent hover:underline"
                    title="Jump to this time"
                  >
                    {formatTime(issue.time)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-slate-500">
          Checks the currently loaded mapset the way osu!'s editor AiMod does.
          Unsnapped objects are the usual reason a perfectly-timed converted map
          shows as off-grid in osu - Resnap moves them onto the nearest valid
          beat divisor.
        </p>
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
