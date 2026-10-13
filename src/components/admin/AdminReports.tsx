import { useCallback, useEffect, useState } from "react";
import {
  adminListUserReports,
  adminResolveUserReport,
  type AdminUserReport,
} from "../../lib/social";
import { Button } from "../ui/Controls";
import { SkeletonRows } from "../ui/Skeleton";
import { formatMoment } from "./format";

/** Reports people filed from profiles (migration 0041), newest first. */
export function ReportsTab() {
  const [status, setStatus] = useState<"open" | "resolved">("open");
  const [items, setItems] = useState<AdminUserReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setItems(null);
    setError(null);
    adminListUserReports(status)
      .then(setItems)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load reports."));
  }, [status]);

  useEffect(load, [load]);

  const resolve = (report: AdminUserReport) => {
    adminResolveUserReport(report.id)
      .then(() => setItems((prev) => prev?.filter((r) => r.id !== report.id) ?? null))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to resolve the report."));
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-400">User reports</h2>
        <div className="flex rounded-lg border border-white/10 p-0.5 text-xs">
          {(["open", "resolved"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize transition ${
                status === value ? "bg-white/10 text-slate-100" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="mb-3 text-sm text-rose-400">{error}</p>}
      {!items && !error && <SkeletonRows count={3} lines={2} avatar action={false} label="Loading reports" />}
      {items && items.length === 0 && (
        <p className="text-sm text-slate-400">{status === "open" ? "No open reports." : "No resolved reports."}</p>
      )}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((report) => (
            <li key={report.id} className="flex gap-3 rounded-xl border border-ink-600 bg-ink-800 p-3">
              {report.reported_avatar_url ? (
                <img src={report.reported_avatar_url} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-full bg-ink-600" />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <a
                    href={`/user/${encodeURIComponent(report.reported)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-accent hover:underline"
                  >
                    {report.reported}
                  </a>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] capitalize text-slate-300">{report.reason}</span>
                  <span className="text-xs text-slate-500">
                    by {report.reporter ?? "a deleted account"} · {formatMoment(report.created_at)}
                  </span>
                </div>
                {report.details && (
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">{report.details}</p>
                )}
              </div>
              {report.status === "open" && (
                <Button className="shrink-0 self-start px-2.5 py-1 text-xs" variant="primary" onClick={() => resolve(report)}>
                  Resolve
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
