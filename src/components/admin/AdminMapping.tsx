import { useEffect, useState } from "react";
import { formatDuration, localDay } from "../../lib/mappingTracker";
import { periodTotals, type MappingStats } from "../../lib/mappingStats";
import { getMappingStats } from "../../lib/mappingStatsApi";
import { ActivityCalendar } from "../social/MappingActivity";
import { SkeletonTable } from "../ui/Skeleton";
import { formatMoment } from "./format";

/**
 * One account's mapping in Cascade, in full: admins see it whatever the
 * account's privacy settings say (migration 0044).
 */
export function UserMappingSection({ userId, username }: { userId: string; username: string }) {
  const [stats, setStats] = useState<MappingStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStats(null);
    setError(null);
    getMappingStats(userId)
      .then(setStats)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load mapping stats."));
  }, [userId]);

  const today = localDay(Date.now());
  const periods = stats ? periodTotals(stats.calendar, today) : null;
  const empty = stats && !stats.counters?.active_days && !stats.projects?.length;

  return (
    <section className="mt-6 rounded-lg bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xs font-semibold text-slate-300">Mapping in Cascade</h2>
        <a
          href={`/user/${encodeURIComponent(username)}/activity`}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-accent hover:underline"
        >
          Open profile
        </a>
      </div>
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {!stats && !error && <SkeletonTable rows={3} columns={4} label="Loading mapping stats" />}
      {empty && <p className="text-sm text-slate-500">No mapping recorded for this account yet.</p>}
      {stats && !empty && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
            <Tile label="Mapping time" value={formatDuration(stats.totals?.edit)} />
            <Tile label="Last 7 days" value={periods ? formatDuration(periods.week) : "–"} />
            <Tile label="Playtesting" value={formatDuration(stats.totals?.playtest)} />
            <Tile label="Reviewing" value={formatDuration(stats.totals?.review)} />
            <Tile label="Longest session" value={formatDuration(stats.totals?.longest_session)} />
            <Tile label="Active days" value={String(stats.counters?.active_days ?? 0)} />
            <Tile label="Notes placed" value={String(stats.counters?.notes_placed ?? 0)} />
            <Tile label="Notes deleted" value={String(stats.counters?.notes_deleted ?? 0)} />
            <Tile label="Timing / SV" value={`${stats.counters?.timing_changes ?? 0} / ${stats.counters?.sv_changes ?? 0}`} />
            <Tile label="Playtests" value={String(stats.counters?.playtests ?? 0)} />
            <Tile label="Exports" value={String(stats.counters?.exports ?? 0)} />
            <Tile label="Maps created / edited" value={`${stats.counters?.maps_created ?? 0} / ${stats.counters?.maps_edited ?? 0}`} />
          </div>
          {stats.calendar && stats.calendar.length > 0 && <ActivityCalendar calendar={stats.calendar} today={today} />}
          {stats.projects && stats.projects.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="pb-2 font-medium">Map</th>
                    <th className="pb-2 text-right font-medium">Editing</th>
                    <th className="pb-2 text-right font-medium">Playtest</th>
                    <th className="pb-2 text-right font-medium">Notes</th>
                    <th className="pb-2 text-right font-medium">Last edited</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.projects.map((p) => (
                    <tr key={p.project_key} className="border-t border-ink-600/60">
                      <td className="max-w-[18rem] py-1.5 pr-3">
                        <div className="truncate text-slate-200">{p.title || "Untitled"}</div>
                        <div className="truncate text-[11px] text-slate-500">
                          {p.artist || "–"} · {p.project_key.startsWith("cloud:") ? "cloud" : "local"}
                          {p.created_in_cascade ? " · created in Cascade" : ""}
                        </div>
                      </td>
                      <td className="py-1.5 text-right font-mono text-xs text-slate-300">{formatDuration(p.edit)}</td>
                      <td className="py-1.5 text-right font-mono text-xs text-slate-400">{formatDuration(p.playtest)}</td>
                      <td className="py-1.5 text-right font-mono text-xs text-slate-400">{p.notes_placed}</td>
                      <td className="py-1.5 text-right text-xs text-slate-500">{formatMoment(p.last_active_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-900/40 px-3 py-2">
      <div className="text-2xs text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-slate-100">{value}</div>
    </div>
  );
}
