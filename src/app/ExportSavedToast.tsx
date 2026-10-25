import { useEffect, useState } from "react";
import { Toast, type ToastAction } from "../components/ui/Toast";
import {
  onExportSaved,
  revealExport,
  type ExportSaved,
} from "../lib/exportDestination";
import { useT, type Translate } from "../lib/i18n";

function whereText(saved: ExportSaved, t: Translate): string {
  const { location, fellBack } = saved;
  if (location.kind === "path") {
    return fellBack
      ? t("exportSaved.pathFallback", { folder: location.folder })
      : t("exportSaved.path", { folder: location.folder });
  }
  if (location.kind === "folder") {
    return t("exportSaved.folder", { folder: location.folder });
  }
  return fellBack ? t("exportSaved.browserFallback") : t("exportSaved.browser");
}

/** After every export: what it was saved as and where it went. */
export function ExportSavedToast() {
  const t = useT();
  const [shown, setShown] = useState<{ saved: ExportSaved; id: number } | null>(
    null,
  );
  const [revealError, setRevealError] = useState<string | null>(null);

  useEffect(() => {
    let id = 0;
    return onExportSaved((saved) => {
      id += 1;
      setRevealError(null);
      setShown({ saved, id });
    });
  }, []);

  const location = shown?.saved.location;
  const actions: ToastAction[] =
    location?.kind === "path"
      ? [
          {
            label: t("exportSaved.show"),
            onClick: () =>
              void revealExport(location.path).catch((error: unknown) =>
                setRevealError(error instanceof Error ? error.message : String(error)),
              ),
          },
        ]
      : [];

  return (
    <Toast
      open={!!shown}
      tone={shown?.saved.fellBack || revealError ? "warning" : "success"}
      title={shown ? t("exportSaved.title", { name: shown.saved.fileName }) : null}
      message={
        shown ? (
          <span className="break-words">{revealError ?? whereText(shown.saved, t)}</span>
        ) : null
      }
      actions={actions}
      durationMs={8000}
      resetKey={shown?.id ?? null}
      onDismiss={() => setShown(null)}
    />
  );
}
