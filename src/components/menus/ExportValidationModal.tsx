import type { ValidationResult } from "../../lib/validation";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Controls";

type Props = {
  open: boolean;
  result: ValidationResult | null;
  /** What the user was exporting, e.g. ".osz" — used in the footer label. */
  target: string;
  onClose: () => void;
  /** Proceed with the export (only enabled when there are no errors). */
  onProceed: () => void;
  /** Strip duplicate notes from every difficulty. */
  onRemoveDuplicates: () => void;
};

/**
 * Pre-export check: lists blocking errors and advisory warnings. Export is only
 * allowed once there are no errors; warnings can be exported through. Duplicate
 * notes can be removed in place from here.
 */
export function ExportValidationModal({
  open,
  result,
  target,
  onClose,
  onProceed,
  onRemoveDuplicates,
}: Props) {
  if (!result) return null;
  const { errors, warnings, duplicateCount } = result;
  const canExport = errors.length === 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Before exporting"
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          {duplicateCount > 0 && (
            <Button variant="primary" onClick={onRemoveDuplicates}>
              Remove {duplicateCount} duplicate{duplicateCount === 1 ? "" : "s"}
            </Button>
          )}
          <Button variant="accent" onClick={onProceed} disabled={!canExport}>
            {canExport ? `Export ${target}` : "Fix errors first"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {errors.length === 0 && warnings.length === 0 && (
          <p className="text-sm text-emerald-300">
            Everything looks good — ready to export.
          </p>
        )}

        {errors.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-red-300">
              Errors ({errors.length}) · must fix
            </h3>
            <ul className="flex flex-col gap-1">
              {errors.map((e, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-1.5 text-sm text-red-200"
                >
                  <span>✕</span>
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
              Warnings ({warnings.length}) · optional
            </h3>
            <ul className="flex flex-col gap-1">
              {warnings.map((w, i) => (
                <li
                  key={i}
                  className="flex gap-2 rounded-lg border border-amber-500/30 bg-amber-950/20 px-3 py-1.5 text-sm text-amber-100"
                >
                  <span>⚠</span>
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
