import type { ValidationResult } from "../../lib/validation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";
import { ErrorIcon, WarningIcon } from "../ui/Icons";
import { useT } from "../../lib/i18n";

type Props = {
  open: boolean;
  result: ValidationResult | null;
  target: string;
  onClose: () => void;
  onProceed: () => void;
  onRemoveDuplicates: () => void;
};

export function ExportValidationModal({
  open,
  result,
  target,
  onClose,
  onProceed,
  onRemoveDuplicates,
}: Props) {
  const t = useT();
  if (!result) return null;
  const { errors, warnings, duplicateCount } = result;
  const canExport = errors.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("exportCheck.title")}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          {duplicateCount > 0 && (
            <Button variant="primary" onClick={onRemoveDuplicates}>
              {t("exportCheck.removeDuplicates", { count: duplicateCount })}
            </Button>
          )}
          <Button variant="accent" onClick={onProceed} disabled={!canExport}>
            {canExport ? t("exportCheck.export", { target }) : t("exportCheck.fixFirst")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {errors.length === 0 && warnings.length === 0 && (
          <p className="text-sm text-emerald-300">
            {t("exportCheck.allGood")}
          </p>
        )}

        {errors.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-red-300">
              {t("exportCheck.errors", { count: errors.length })}
            </h3>
            <ul className="flex flex-col gap-1">
              {errors.map((e, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-1.5 text-sm text-red-200"
                >
                  <ErrorIcon className="mt-0.5 h-4 w-4 shrink-0 text-red-300" />
                  <span>
                    {e.message}
                    {e.scope && (
                      <span className="text-red-300/60"> · [{e.scope}]</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {warnings.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-300">
              {t("exportCheck.warnings", { count: warnings.length })}
            </h3>
            <ul className="flex flex-col gap-1">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-1.5 text-sm text-amber-100"
                >
                  <WarningIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                  <span>
                    {w.message}
                    {w.scope && (
                      <span className="text-amber-200/60"> · [{w.scope}]</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
}
