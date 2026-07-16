import type { PackValidationResult } from "../types/packCreator";

export function PackCreatorValidation({
  result,
}: {
  result: PackValidationResult | null;
}) {
  if (!result) {
    return (
      <p className="text-xs text-slate-500">
        Run <span className="text-slate-300">Validate Pack</span> to check the
        pack before exporting.
      </p>
    );
  }
  if (result.errors.length === 0 && result.warnings.length === 0) {
    return (
      <p className="text-xs font-medium text-emerald-400">
        No problems found. The pack is ready to export.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {result.errors.length > 0 && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-rose-300">
            Errors · must be fixed
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-rose-200">
            {result.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-400/25 bg-amber-400/10 p-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber-300">
            Warnings
          </p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-amber-100/90">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
