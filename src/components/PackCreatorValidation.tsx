import type { PackValidationResult } from "../types/packCreator";
import { useT } from "../lib/i18n";
import { ErrorIcon, WarningIcon } from "./ui/Icons";

/**
 * The pack's findings, errors first. Each is its own line with an icon in its
 * severity, so a long list still scans; before a run it is one quiet line.
 */
export function PackCreatorValidation({
  result,
}: {
  result: PackValidationResult | null;
}) {
  const t = useT();
  if (!result) {
    return (
      <p className="text-xs text-slate-500">
        {t("packValidation.runBefore")}{" "}
        <span className="font-medium text-slate-300">{t("pack.validate")}</span>{" "}
        {t("packValidation.runAfter")}
      </p>
    );
  }
  if (result.errors.length === 0 && result.warnings.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-emerald-300">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {t("packValidation.ready")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {result.errors.length > 0 && (
        <Findings
          title={t("packValidation.errors")}
          items={result.errors}
          tone="error"
        />
      )}
      {result.warnings.length > 0 && (
        <Findings
          title={t("aimodUi.warnings")}
          items={result.warnings}
          tone="warning"
        />
      )}
    </div>
  );
}

function Findings({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "error" | "warning";
}) {
  const Icon = tone === "error" ? ErrorIcon : WarningIcon;
  return (
    <section>
      <h4
        className={`mb-1 flex items-baseline gap-1.5 text-xs font-semibold ${
          tone === "error" ? "text-rose-300" : "text-amber-300"
        }`}
      >
        {title}
        <span className="font-medium tabular-nums opacity-70">{items.length}</span>
      </h4>
      <ul className="divide-y divide-white/[0.05]">
        {items.map((text, i) => (
          <li key={i} className="flex gap-2.5 py-2 text-sm leading-snug text-slate-200">
            <span className={tone === "error" ? "text-rose-400" : "text-amber-300"}>
              <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            </span>
            <span className="min-w-0">{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
